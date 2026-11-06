"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Command, LockKeyhole } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email,password}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to sign in.");
      router.replace("/"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to sign in."); }
    finally { setBusy(false); }
  }
  return <main className="login-wrap"><form className="login-card" onSubmit={submit}><div className="brand" style={{padding:0,marginBottom:28}}><div className="brand-mark"><Command size={19}/></div><div><div className="brand-name">dayflow</div><div className="brand-sub">personal command</div></div></div><div className="eyebrow">Welcome back</div><h1 className="font-display" style={{fontSize:29,letterSpacing:"-1.2px",margin:"8px 0 8px"}}>Your day, with clarity.</h1><p style={{color:"#8f9aaa",fontSize:12,lineHeight:1.6,margin:"0 0 24px"}}>Sign in to open your personal planning workspace.</p><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/>{error && <p role="alert" style={{color:"#f2a6a9",fontSize:11}}>{error}</p>}<button className="primary-button" style={{width:"100%",minHeight:45,marginTop:7}} disabled={busy}><LockKeyhole size={15}/>{busy?"Signing in…":"Sign in securely"}</button><p style={{color:"#6f7c8e",fontSize:10,lineHeight:1.6,marginTop:20}}>Single-owner authentication is configured using environment variables. Never commit credentials to Git.</p></form></main>;
}
