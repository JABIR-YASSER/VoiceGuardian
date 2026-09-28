I want you to prepare my current VoiceGuardian project and publish it to a NEW GitHub repository.

## Project

This is my Vencord UserPlugin called **VoiceGuardian**.

The project:

* Automatically reconnects to the last voice channel after an external disconnect.
* Attempts to remove server mute applied to the current user.
* Attempts to remove server deaf applied to the current user.
* Does NOT fight the user's own self-mute.
* Does NOT fight the user's own self-deaf.
* Does NOT reconnect when the user intentionally leaves.
* Uses a 250ms reconnect delay.
* Uses Vencord/Discord internal voice actions.

The main source file is:

`src/userplugins/VoiceGuardian/index.ts`

## VERY IMPORTANT — PRESERVE THE WORKING CODE

Before changing anything:

1. Inspect the current project.
2. Inspect the current `src/userplugins/VoiceGuardian/index.ts`.
3. Do NOT rewrite the plugin source code.
4. Do NOT refactor the plugin.
5. Do NOT change the Flux event handlers.
6. Do NOT change the voice reconnect logic.
7. Do NOT change the server mute/deaf logic.
8. Do NOT change intentional leave detection.
9. Do NOT change the 250ms reconnect delay.
10. Do NOT make unrelated changes.

The existing VoiceGuardian implementation is already working.

Your job is primarily to prepare the repository, create the README, initialize Git if necessary, create a GitHub repository, commit, and push.

---

# README.md

Create/update `README.md`.

Use this README content:

# 🛡️ VoiceGuardian

A Vencord userplugin that helps maintain your Discord voice connection by automatically reconnecting after external disconnects and restoring server-applied mute/deaf states.

> ⚠️ **UserPlugin / Personal Use**
>
> VoiceGuardian is designed as a personal Vencord userplugin. It is not an official Discord feature and is not affiliated with Discord or Vencord.

## ✨ Features

### 🔄 Automatic Voice Reconnect

If you are unexpectedly disconnected from a voice channel, VoiceGuardian automatically attempts to rejoin your previous voice channel.

* Remembers your last voice channel
* Detects external voice disconnections
* Automatically rejoins the previous channel
* Uses Discord's internal `selectVoiceChannel` action
* Uses a short 250ms reconnect delay
* Checks whether Discord already reconnected before attempting another join

### 🔇 Server Mute Protection

If a server/moderator applies a server mute to you, VoiceGuardian detects it and attempts to remove the server mute.

It distinguishes between:

```text
mute = true
selfMute = false
```

which indicates a server/external mute rather than a user-controlled self-mute.

### 🔕 Server Deaf Protection

VoiceGuardian also detects server-applied deafening and attempts to restore your voice state.

It checks:

```text
deaf = true
selfDeaf = false
```

before attempting to remove the server deaf state.

### 🎙️ Respects Your Own Voice Controls

VoiceGuardian does not fight your intentional voice actions.

If you manually:

* Self-mute
* Self-deafen
* Leave a voice channel

the plugin does not intentionally undo those actions.

## 🧠 Smart Disconnect Detection

Discord can emit voice-channel selection events with `channelId = null` during navigation or startup.

VoiceGuardian checks the actual voice state before deciding that the user intentionally left.

This prevents normal Discord navigation events from being incorrectly interpreted as a deliberate disconnect.

## 🛠️ Requirements

* Vencord
* Discord Desktop
* Vencord development/source installation
* Node.js
* pnpm
* Git

## 📂 Installation

Clone Vencord:

```bash
git clone https://github.com/Vendicated/Vencord.git
cd Vencord
pnpm install
```

Create:

```text
src/userplugins/VoiceGuardian/
```

Place the plugin at:

```text
src/userplugins/VoiceGuardian/index.ts
```

Start Vencord development mode:

```bash
pnpm dev
```

Then inject Vencord into Discord if required by the local Vencord setup.

Enable:

```text
Discord Settings → Vencord → Plugins → VoiceGuardian
```

## ⚙️ Configuration

VoiceGuardian currently requires no configuration.

It automatically:

* Remembers your voice channel
* Detects external disconnects
* Rejoins automatically
* Detects server mute
* Attempts to remove server mute
* Detects server deaf
* Attempts to remove server deaf
* Ignores self-mute
* Ignores self-deaf
* Ignores intentional disconnects

## 🧪 Testing

### External Disconnect

Join a voice channel and trigger an external disconnect.

Expected logs include:

```text
[VoiceGuardian] External disconnect detected.
```

then:

```text
[VoiceGuardian] Reconnecting to <CHANNEL_ID> in 250ms
```

and:

```text
[VoiceGuardian] Rejoining voice channel: <CHANNEL_ID>
```

### Server Mute

When externally/server muted, VoiceGuardian should detect:

```text
Detected external/server mute.
```

and attempt:

```text
setServerMute(false)
```

### Server Deaf

When externally/server deafened, VoiceGuardian should detect:

```text
Detected external/server deaf.
```

and attempt to remove the server deaf state.

### Self Mute

When manually self-muted:

```text
Self-mute detected. Leaving it unchanged.
```

The plugin should not automatically unmute the user.

### Self Deaf

When manually self-deafened:

```text
Self-deaf detected. Leaving it unchanged.
```

The plugin should not automatically undeafen the user.

### Intentional Leave

When the user intentionally leaves a voice channel, VoiceGuardian should not reconnect.

## 🧩 How It Works

VoiceGuardian uses Vencord/Discord internal modules for voice state management.

Voice channel navigation:

```ts
const VoiceChannelActions = findByPropsLazy(
    "selectVoiceChannel",
    "selectChannel"
);
```

Server voice actions:

```ts
const GuildVoiceActions = findByPropsLazy(
    "setServerMute",
    "setChannel"
);
```

It also uses:

```ts
MediaEngineStore
SelectedChannelStore
UserStore
VoiceStateStore
```

to monitor and manage the local voice state.

## 🔄 Reconnect Logic

The reconnect flow is:

```text
External disconnect
        ↓
Check intentionalLeave
        ↓
Check previous channel
        ↓
Wait 250ms
        ↓
Check if Discord already reconnected
        ↓
selectVoiceChannel(previousChannel)
        ↓
Reconnect
```

## ⚠️ Limitations

VoiceGuardian operates through Discord/Vencord's internal client actions.

It cannot bypass Discord permissions or server-side enforcement.

Discord's internal modules may change between updates. If Discord changes its internal webpack modules or voice events, some VoiceGuardian functionality may stop working until the plugin is updated.

## 🔐 Privacy

VoiceGuardian does not require:

* An external server
* API keys
* A database
* Cloud hosting
* External authentication
* A backend

The plugin operates locally inside the Vencord/Discord client.

## 🐛 Troubleshooting

If the plugin does not appear:

* Verify `src/userplugins/VoiceGuardian/index.ts`
* Restart/rebuild Vencord
* Check that the plugin is enabled

If reconnect does not work, check for:

```text
[VoiceGuardian] External disconnect detected.
```

and:

```text
[VoiceGuardian] Rejoining voice channel:
```

If server mute does not get removed, check for:

```text
[VoiceGuardian] Detected external/server mute.
```

If server deaf does not get removed, check for:

```text
[VoiceGuardian] Detected external/server deaf.
```

## 🤝 Contributing

Bug reports and improvements are welcome.

When reporting an issue, include:

* Discord version
* Vencord version/commit
* VoiceGuardian version/commit
* What happened
* Expected behavior
* Relevant VoiceGuardian console logs

Do not include personal information or sensitive Discord data.

## 📜 License

This project is provided for personal and educational use.

See the repository license for the applicable terms.

## ⚠️ Disclaimer

VoiceGuardian is an unofficial third-party plugin.

It is:

* Not developed by Discord
* Not affiliated with Discord
* Not an official Vencord plugin
* Dependent on Discord's internal client implementation

Discord and Vencord may change their internal APIs at any time, which can break functionality.

Use it at your own discretion.

## 👨‍💻 Author

**Yasser Jabir**

GitHub: `JABIR-YASSER`

## 📌 Current Version

**VoiceGuardian v1.0.0**

| Feature                       |     Status     |
| ----------------------------- | :------------: |
| Automatic reconnect           |        ✅       |
| External disconnect detection |        ✅       |
| Server unmute                 |        ✅       |
| Server undeafen               |        ✅       |
| Self-mute protection          |        ✅       |
| Self-deaf protection          |        ✅       |
| Intentional leave detection   |        ✅       |
| Automatic channel tracking    |        ✅       |
| 250ms reconnect delay         |        ✅       |
| External backend              | ❌ Not required |

> **VoiceGuardian — Stay connected. 🎙️🛡️**

---

# Git setup

First inspect the current repository:

```bash
git status
git remote -v
git branch --show-current
```

If Git is not initialized:

```bash
git init
```

Create an appropriate `.gitignore` if one does not already exist.

Do NOT ignore:

```text
src/userplugins/VoiceGuardian/index.ts
README.md
```

Do not commit:

* `.env`
* credentials
* API keys
* Discord tokens
* personal secrets
* build artifacts that should not be version controlled
* `node_modules`

---

# GitHub repository creation

I HAVE NOT CREATED THE GITHUB REPOSITORY YET.

Use the available GitHub integration/tooling if available to create a NEW repository.

Repository name:

```text
VoiceGuardian
```

Description:

```text
Vencord userplugin for automatic voice reconnect and voice-state recovery.
```

Make the repository **public** unless GitHub/tooling requires me to choose otherwise.

Do NOT create a second repository if one already exists with this exact name under my account.

Before creating the repository, check whether `VoiceGuardian` already exists under my GitHub account.

Do NOT guess my GitHub username if it is not available from my authenticated GitHub connection.

Do NOT use a random GitHub account.

---

# README and source verification

Before committing:

```bash
git status
git diff -- README.md
```

Verify:

```text
src/userplugins/VoiceGuardian/index.ts
```

has not been unintentionally modified.

If the source file has modifications that were already present before you started, DO NOT overwrite them.

---

# Commit

Stage the appropriate files:

```bash
git add README.md
git add src/userplugins/VoiceGuardian/index.ts
```

Only include the source file if it is already part of the intended project/repository.

If there are unrelated changes, do NOT automatically commit them.

Create the commit:

```bash
git commit -m "docs: add VoiceGuardian README"
```

If the initial repository requires a different first commit structure, use a clean equivalent commit message, but keep the commit focused.

---

# Push

After creating the GitHub repository, configure the remote.

Use the repository URL returned by GitHub.

Then:

```bash
git remote -v
git branch --show-current
git status
```

Push the current branch to GitHub.

If the branch is `master`, you may rename it to `main` before pushing:

```bash
git branch -M main
```

Then push:

```bash
git push -u origin main
```

NEVER use:

```bash
git push --force
```

Do not overwrite remote history.

---

# Authentication

If GitHub authentication is required:

STOP and tell me exactly what action I need to take.

Do not:

* Ask me for my GitHub password
* Ask me for a personal access token in chat
* Put credentials into files
* Put credentials into the Git remote URL
* Disable security features

Use the authenticated GitHub/VS Code GitHub integration if available.

---

# Final report

When finished, report:

1. GitHub repository name
2. GitHub repository URL
3. Branch name
4. Commit hash
5. Files committed
6. Whether the push succeeded
7. Any warnings or issues encountered

Do not claim the repository was pushed unless the push actually succeeded.
::
