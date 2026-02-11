# Installing and Setting Up Ngrok

## Option 1: Install via Chocolatey (Recommended for Windows)

Open PowerShell as Administrator and run:
```powershell
choco install ngrok
```

If you don't have Chocolatey, install it first:
```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

## Option 2: Direct Download (Easier)

1. Go to: https://ngrok.com/download
2. Download the Windows version (ngrok.exe)
3. Extract the ZIP file to a folder (e.g., `C:\ngrok`)
4. Add to PATH or run from that folder

## Quick Setup

1. **Sign up for free account** (required):
   - Go to: https://dashboard.ngrok.com/signup
   - Sign up (free account is fine)

2. **Get your authtoken**:
   - After login, go to: https://dashboard.ngrok.com/get-started/your-authtoken
   - Copy the authtoken

3. **Configure ngrok**:
   ```bash
   ngrok config add-authtoken YOUR_AUTH_TOKEN_HERE
   ```

4. **Start tunnel for port 3000**:
   ```bash
   ngrok http 3000
   ```

5. **Copy the HTTPS URL** (looks like `https://abc123.ngrok.io`)

---

## Alternative: Test Without Webhooks (For Now)

If you want to test quickly without ngrok, I can manually activate the subscription in the database after you complete the payment.

**Which option do you prefer:**
1. Install ngrok now (takes 5 minutes)
2. Skip webhooks and manually activate (I'll do it for you)
