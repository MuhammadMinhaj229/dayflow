# Import DayFlow into GitHub

The DayFlow project is maintained in `MuhammadMinhaj229/dayflow`.

## Publish from a local Git bundle

```bash
git clone dayflow.bundle dayflow
cd dayflow
git remote add origin https://github.com/MuhammadMinhaj229/dayflow.git
git push -u origin main
```

## Vercel connection

In Vercel, open `dayflow-personal-command-center` → Settings → Git → Connect Git Repository, then select `MuhammadMinhaj229/dayflow`. Use the repository root, Next.js framework, Node.js 22.x and region `bom1`.

Never commit `.env.local`, database connection strings, passwords, session secrets or integration tokens. Configure production secrets only in Vercel Environment Variables.
