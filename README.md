# Screenshot Language Compare (Electron + React)

Desktop app for comparing English screenshots with translated screenshots side-by-side.

## Tech Stack

- Node.js
- React (Vite)
- Electron

## Expected Folder Structure

```text
languages/
  english/
    ScriptA/
      xyz/
        Login_01_EN.png
        Home_01_EN.png
  danish/
    ScriptA/
      xyz/
        Login_01_DA.png
        Home_01_DA.png
```

## Matching Rules

- Left panel: only English files ending in `_EN`
- Right panel: selected language files where filename stem has `_` as 3rd-last character (like `_DA`, `_FR`, `_DE`)
- Key match is base name after removing language suffix
  - `Login_01_EN.png` matches `Login_01_DA.png`

## Run (Windows PowerShell)

```powershell
npm install
npm run dev
```

## Features

- Choose `languages` root folder
- Choose language folder to compare
- Choose inner folder like `xyz` (or `(All)`)
- Previous/Next navigation
- Clear missing-match message
