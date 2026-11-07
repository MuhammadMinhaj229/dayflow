package com.dayflow.app;

import android.content.Intent;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.system.ErrnoException;
import android.system.Os;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "DayFlowNative")
public final class DayFlowNativePlugin extends Plugin {
    private static final String ROOT = "DayFlow";
    private static final String[] FOLDERS = {
        "backups", "exports", "imports", "attachments", "diagnostics", "update-manifests"
    };
    private static final int MAX_BACKUP_BYTES = 70 * 1024 * 1024;
    private static final int MAX_SECRET_BYTES = 64 * 1024;
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS_PREFIX = "dayflow.vault.";

    private File workspace() {
        return new File(getContext().getFilesDir(), ROOT);
    }

    private File backupDirectory() throws Exception {
        File directory = new File(workspace(), "backups");
        ensureDirectory(directory);
        return directory;
    }

    private void ensureDirectory(File directory) throws Exception {
        if (!directory.isDirectory() && !directory.mkdirs()) {
            throw new Exception("DayFlow could not create a private storage directory.");
        }
    }

    private boolean validFileName(String name) {
        return name != null && name.matches("^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\\.dayflow$");
    }

    private String keyAlias(String raw) throws Exception {
        if (raw == null || !raw.matches("^[A-Za-z0-9._-]{1,80}$")) {
            throw new Exception("The device secret identifier is invalid.");
        }
        return ALIAS_PREFIX + raw;
    }

    private byte[] readLimited(InputStream input, int maximum) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        int count;
        while ((count = input.read(buffer)) != -1) {
            total += count;
            if (total > maximum) throw new Exception("The selected file exceeds DayFlow's size limit.");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    private synchronized void atomicWrite(File destination, byte[] bytes) throws Exception {
        File parent = destination.getParentFile();
        ensureDirectory(parent);
        File temporary = new File(parent, destination.getName() + "." + UUID.randomUUID() + ".tmp");
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write(bytes);
            output.getFD().sync();
        }

        // POSIX rename atomically replaces an existing file on the same filesystem.
        // The old backup remains intact if the write or rename fails.
        try {
            Os.rename(temporary.getAbsolutePath(), destination.getAbsolutePath());
        } catch (ErrnoException error) {
            temporary.delete();
            throw new Exception("DayFlow could not finish saving the file.", error);
        }

        destination.setReadable(false, false);
        destination.setWritable(false, false);
        destination.setReadable(true, true);
        destination.setWritable(true, true);
    }

    private SecretKey getOrCreateSecretKey(String alias) throws Exception {
        KeyStore store = KeyStore.getInstance(KEYSTORE);
        store.load(null);
        if (store.containsAlias(alias)) return (SecretKey) store.getKey(alias, null);

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        KeyGenParameterSpec parameters = new KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .setKeySize(256)
            .build();
        generator.init(parameters);
        return generator.generateKey();
    }

    @PluginMethod
    public void initializeWorkspace(PluginCall call) {
        try {
            ensureDirectory(workspace());
            for (String folder : FOLDERS) ensureDirectory(new File(workspace(), folder));
            JSObject result = new JSObject();
            result.put("ready", true);
            result.put("storage", "android-app-private");
            result.put("directoryCount", FOLDERS.length);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("DayFlow could not initialise its private workspace.", error);
        }
    }

    @PluginMethod
    public void saveBackup(PluginCall call) {
        byte[] bytes = null;
        try {
            String name = call.getString("fileName");
            String encoded = call.getString("base64");
            if (!validFileName(name) || encoded == null || encoded.length() > 96 * 1024 * 1024) {
                call.reject("The backup file name or contents are invalid.");
                return;
            }
            bytes = Base64.decode(encoded, Base64.DEFAULT);
            if (bytes.length == 0 || bytes.length > MAX_BACKUP_BYTES) {
                call.reject("The backup exceeds DayFlow's private-storage limit.");
                return;
            }
            atomicWrite(new File(backupDirectory(), name), bytes);
            JSObject result = new JSObject();
            result.put("saved", true);
            result.put("fileName", name);
            result.put("bytes", bytes.length);
            result.put("location", "private");
            call.resolve(result);
        } catch (Exception error) {
            call.reject("DayFlow could not save the private backup.", error);
        } finally {
            if (bytes != null) Arrays.fill(bytes, (byte) 0);
        }
    }

    @PluginMethod
    public void exportBackup(PluginCall call) {
        byte[] bytes = null;
        try {
            String name = call.getString("fileName");
            String encoded = call.getString("base64");
            if (!validFileName(name) || encoded == null || encoded.length() > 96 * 1024 * 1024) {
                call.reject("The backup file name or contents are invalid.");
                return;
            }
            bytes = Base64.decode(encoded, Base64.DEFAULT);
            if (bytes.length == 0 || bytes.length > MAX_BACKUP_BYTES) {
                call.reject("The backup exceeds DayFlow's export limit.");
                return;
            }
            File temporary = new File(backupDirectory(), name + ".pending");
            atomicWrite(temporary, bytes);
            call.getData().put("pendingBackupName", temporary.getName());

            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/vnd.dayflow.backup+json");
            intent.putExtra(Intent.EXTRA_TITLE, name);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            startActivityForResult(call, intent, "exportBackupResult");
        } catch (Exception error) {
            call.reject("DayFlow could not start backup export.", error);
        } finally {
            if (bytes != null) Arrays.fill(bytes, (byte) 0);
        }
    }

    @ActivityCallback
    private void exportBackupResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        String pendingName = call.getString("pendingBackupName");
        File pending = pendingName == null ? null : new File(backupDirectorySafe(), pendingName);

        if (result.getResultCode() != android.app.Activity.RESULT_OK ||
            result.getData() == null || result.getData().getData() == null) {
            if (pending != null) pending.delete();
            JSObject cancelled = new JSObject();
            cancelled.put("exported", false);
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }

        Uri uri = result.getData().getData();
        if (pending == null || !pending.isFile()) {
            call.reject("The temporary backup is no longer available.");
            return;
        }

        try (InputStream input = new FileInputStream(pending);
             OutputStream output = getContext().getContentResolver().openOutputStream(uri, "w")) {
            if (output == null) throw new Exception("Android could not open the selected destination.");
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            output.flush();
            pending.delete();
            JSObject exported = new JSObject();
            exported.put("exported", true);
            exported.put("uri", uri.toString());
            call.resolve(exported);
        } catch (Exception error) {
            call.reject("DayFlow could not export the backup.", error);
        }
    }

    private File backupDirectorySafe() {
        return new File(workspace(), "backups");
    }

    @PluginMethod
    public void pickBackup(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
            "application/vnd.dayflow.backup+json", "application/json", "application/octet-stream"
        });
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivityForResult(call, intent, "pickBackupResult");
    }

    @ActivityCallback
    private void pickBackupResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != android.app.Activity.RESULT_OK ||
            result.getData() == null || result.getData().getData() == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }

        byte[] bytes = null;
        try (InputStream input = getContext().getContentResolver().openInputStream(result.getData().getData())) {
            if (input == null) throw new Exception("Android could not read the selected backup.");
            bytes = readLimited(input, MAX_BACKUP_BYTES + 128 * 1024);
            JSObject selected = new JSObject();
            selected.put("cancelled", false);
            selected.put("fileName", "selected.dayflow");
            selected.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
            selected.put("bytes", bytes.length);
            call.resolve(selected);
        } catch (Exception error) {
            call.reject("DayFlow could not read the selected backup.", error);
        } finally {
            if (bytes != null) Arrays.fill(bytes, (byte) 0);
        }
    }

    @PluginMethod
    public void listPrivateBackups(PluginCall call) {
        try {
            File[] files = backupDirectory().listFiles((directory, name) -> validFileName(name));
            if (files == null) files = new File[0];
            Arrays.sort(files, (left, right) -> Long.compare(right.lastModified(), left.lastModified()));

            JSArray backups = new JSArray();
            for (File file : files) {
                if (!file.isFile() || file.length() <= 0 || file.length() > MAX_BACKUP_BYTES) continue;
                JSObject item = new JSObject();
                item.put("fileName", file.getName());
                item.put("bytes", file.length());
                item.put("modifiedAt", file.lastModified());
                backups.put(item);
            }

            JSObject result = new JSObject();
            result.put("backups", backups);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("DayFlow could not list its private backups.", error);
        }
    }

    @PluginMethod
    public void readPrivateBackup(PluginCall call) {
        byte[] bytes = null;
        try {
            String name = call.getString("fileName");
            if (!validFileName(name)) {
                call.reject("The selected private backup name is invalid.");
                return;
            }

            File file = new File(backupDirectory(), name);
            if (!file.isFile() || file.length() <= 0 || file.length() > MAX_BACKUP_BYTES) {
                call.reject("The selected private backup is missing or exceeds the supported size.");
                return;
            }

            try (InputStream input = new FileInputStream(file)) {
                bytes = readLimited(input, MAX_BACKUP_BYTES);
            }

            JSObject result = new JSObject();
            result.put("fileName", file.getName());
            result.put("bytes", bytes.length);
            result.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("DayFlow could not read the private backup.", error);
        } finally {
            if (bytes != null) Arrays.fill(bytes, (byte) 0);
        }
    }

    @PluginMethod
    public void encryptSecret(PluginCall call) {
        byte[] plaintext = null;
        byte[] encrypted = null;
        try {
            String alias = keyAlias(call.getString("alias"));
            String value = call.getString("plaintext");
            if (value == null) {
                call.reject("The secret is missing.");
                return;
            }
            plaintext = value.getBytes(StandardCharsets.UTF_8);
            if (plaintext.length == 0 || plaintext.length > MAX_SECRET_BYTES) {
                call.reject("The secret exceeds the supported size.");
                return;
            }

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey(alias));
            cipher.updateAAD(alias.getBytes(StandardCharsets.UTF_8));
            encrypted = cipher.doFinal(plaintext);

            JSObject result = new JSObject();
            result.put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));
            result.put("ciphertext", Base64.encodeToString(encrypted, Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("DayFlow could not encrypt the device secret.", error);
        } finally {
            if (plaintext != null) Arrays.fill(plaintext, (byte) 0);
            if (encrypted != null) Arrays.fill(encrypted, (byte) 0);
        }
    }

    @PluginMethod
    public void decryptSecret(PluginCall call) {
        byte[] iv = null;
        byte[] encrypted = null;
        byte[] plaintext = null;
        try {
            String alias = keyAlias(call.getString("alias"));
            String ivEncoded = call.getString("iv");
            String encryptedEncoded = call.getString("ciphertext");
            if (ivEncoded == null || encryptedEncoded == null || encryptedEncoded.length() > 96 * 1024) {
                call.reject("The encrypted secret is invalid.");
                return;
            }

            KeyStore store = KeyStore.getInstance(KEYSTORE);
            store.load(null);
            if (!store.containsAlias(alias)) {
                call.reject("The device key is unavailable. Reconnect the integration or restore it from its recovery flow.");
                return;
            }

            iv = Base64.decode(ivEncoded, Base64.DEFAULT);
            encrypted = Base64.decode(encryptedEncoded, Base64.DEFAULT);
            if (iv.length != 12 || encrypted.length < 16 || encrypted.length > MAX_SECRET_BYTES + 16) {
                call.reject("The encrypted secret payload is invalid.");
                return;
            }

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, (SecretKey) store.getKey(alias, null), new GCMParameterSpec(128, iv));
            cipher.updateAAD(alias.getBytes(StandardCharsets.UTF_8));
            plaintext = cipher.doFinal(encrypted);

            JSObject result = new JSObject();
            result.put("plaintext", new String(plaintext, StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("DayFlow could not decrypt the device secret.", error);
        } finally {
            if (iv != null) Arrays.fill(iv, (byte) 0);
            if (encrypted != null) Arrays.fill(encrypted, (byte) 0);
            if (plaintext != null) Arrays.fill(plaintext, (byte) 0);
        }
    }

    @PluginMethod
    public void deleteSecret(PluginCall call) {
        try {
            String alias = keyAlias(call.getString("alias"));
            KeyStore store = KeyStore.getInstance(KEYSTORE);
            store.load(null);
            if (store.containsAlias(alias)) store.deleteEntry(alias);
            call.resolve();
        } catch (Exception error) {
            call.reject("DayFlow could not remove the device key.", error);
        }
    }
}
