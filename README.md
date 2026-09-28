# 🛡️ VoiceGuardian

A Vencord userplugin that helps maintain your Discord voice connection by automatically reconnecting after external disconnects and restoring server-applied mute/deaf states.

> ⚠️ **UserPlugin / Personal Use**
>
> VoiceGuardian is designed as a personal Vencord userplugin. It is not an official Discord feature and is not affiliated with Discord or Vencord.

---

## ✨ Features

### 🔄 Automatic Voice Reconnect

If you are unexpectedly disconnected from a voice channel, VoiceGuardian automatically attempts to rejoin your previous voice channel.

* Remembers your last voice channel
* Detects external voice disconnections
* Automatically rejoins the previous channel
* Uses Discord's internal `selectVoiceChannel` action
* Uses a short **250ms reconnect delay**
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

VoiceGuardian does **not** fight your intentional voice actions.

If you manually:

* Self-mute
* Self-deafen
* Leave a voice channel

the plugin does not intentionally undo those actions.

### 🧠 Smart Disconnect Detection

Discord can emit voice-channel selection events with `channelId = null` during navigation or startup.

VoiceGuardian checks your actual voice state before deciding that you intentionally left.

This prevents normal Discord navigation events from being incorrectly interpreted as a deliberate disconnect.

---

## 🛠️ Requirements

* [Vencord](https://github.com/Vendicated/Vencord)
* Discord Desktop
* Vencord development/source installation
* Node.js
* pnpm
* Git

---

## 📂 Installation

### 1. Install Vencord

Clone Vencord:

```bash
git clone https://github.com/Vendicated/Vencord.git
cd Vencord
```

Install dependencies:

```bash
pnpm install
```

### 2. Install VoiceGuardian

Copy the `VoiceGuardian` folder into:

```text
Vencord/
└── src/
    └── userplugins/
        └── VoiceGuardian/
            └── index.ts
```

### 3. Run Vencord

From the Vencord directory:

```bash
pnpm dev
```

Then inject Vencord into Discord if required by your Vencord setup.

### 4. Enable the plugin

Open Discord:

```text
Settings
→ Vencord
→ Plugins
→ VoiceGuardian
```

Enable **VoiceGuardian**.

---

## ⚙️ Configuration

VoiceGuardian currently requires **no configuration**.

Once enabled, it automatically:

| Feature                    | Status |
| -------------------------- | :----: |
| Remember voice channel     |    ✅   |
| Detect external disconnect |    ✅   |
| Automatic reconnect        |    ✅   |
| Server unmute              |    ✅   |
| Server undeafen            |    ✅   |
| Ignore self-mute           |    ✅   |
| Ignore self-deaf           |    ✅   |
| Ignore intentional leave   |    ✅   |
| Automatic channel tracking |    ✅   |
| 250ms reconnect delay      |    ✅   |
| External backend           |    ❌   |

---

## 🧪 Testing

### 🔄 Test External Disconnect

1. Join a voice channel.
2. Get externally disconnected from the channel.
3. VoiceGuardian detects the disconnect.
4. The plugin waits **250ms**.
5. It attempts to rejoin the previous channel.

Expected console output:

```text
[VoiceGuardian] External disconnect detected.
```

Then:

```text
[VoiceGuardian] Reconnecting to <CHANNEL_ID> in 250ms
```

And:

```text
[VoiceGuardian] Rejoining voice channel: <CHANNEL_ID>
```

---

### 🔇 Test Server Mute

When externally/server muted, VoiceGuardian detects:

```text
[VoiceGuardian] Detected external/server mute.
```

It then attempts to send:

```text
setServerMute(false)
```

---

### 🔕 Test Server Deaf

When externally/server deafened, VoiceGuardian detects:

```text
[VoiceGuardian] Detected external/server deaf.
```

It then attempts to remove the server deaf state.

---

### 🎙️ Test Self-Mute

When you manually self-mute:

```text
[VoiceGuardian] Self-mute detected. Leaving it unchanged.
```

VoiceGuardian does **not** automatically unmute you.

---

### 🔕 Test Self-Deaf

When you manually self-deafen:

```text
[VoiceGuardian] Self-deaf detected. Leaving it unchanged.
```

VoiceGuardian does **not** automatically undeafen you.

---

### 🚪 Test Intentional Leave

When you intentionally leave a voice channel, VoiceGuardian recognizes the action and does **not** attempt to reconnect.

---

## 🧩 How It Works

VoiceGuardian uses Vencord/Discord internal modules to monitor and manage voice state.

### Voice Channel Navigation

```ts
const VoiceChannelActions = findByPropsLazy(
    "selectVoiceChannel",
    "selectChannel"
);
```

The plugin uses `selectVoiceChannel` to rejoin the previous voice channel.

### Server Voice Actions

```ts
const GuildVoiceActions = findByPropsLazy(
    "setServerMute",
    "setChannel"
);
```

These actions are used to attempt server unmute/undeafen operations.

### Voice State Modules

VoiceGuardian uses:

```ts
MediaEngineStore
SelectedChannelStore
UserStore
VoiceStateStore
```

to monitor the user's voice state and active connection.

---

## 🔄 Reconnect Flow

The reconnect process works like this:

```text
┌───────────────────────────┐
│ External Voice Disconnect │
└─────────────┬─────────────┘
              │
              ▼
   ┌──────────────────────┐
   │ Intentional leave?   │
   └──────────┬───────────┘
              │ No
              ▼
   ┌──────────────────────┐
   │ Previous channel?    │
   └──────────┬───────────┘
              │ Yes
              ▼
       ┌─────────────┐
       │ Wait 250ms  │
       └──────┬──────┘
              │
              ▼
   ┌──────────────────────┐
   │ Already reconnected? │
   └──────────┬───────────┘
              │ No
              ▼
   ┌──────────────────────┐
   │ selectVoiceChannel() │
   └──────────┬───────────┘
              │
              ▼
        Rejoin channel
```

---

## 🧠 Voice State Detection

VoiceGuardian distinguishes between server-controlled and user-controlled voice states.

### Server Mute

```text
mute = true
selfMute = false
```

→ VoiceGuardian treats this as an external/server mute.

### Self Mute

```text
selfMute = true
```

→ VoiceGuardian leaves it unchanged.

### Server Deaf

```text
deaf = true
selfDeaf = false
```

→ VoiceGuardian treats this as an external/server deaf.

### Self Deaf

```text
selfDeaf = true
```

→ VoiceGuardian leaves it unchanged.

---

## 🔐 Privacy

VoiceGuardian does not require:

* An external server
* API keys
* A database
* Cloud hosting
* External authentication
* A backend

The plugin operates locally inside the Vencord/Discord client.

---

## ⚠️ Limitations

VoiceGuardian operates through Discord/Vencord's internal client actions.

It **cannot bypass Discord permissions or server-side enforcement**.

Discord's internal modules can change between updates. If Discord changes its internal webpack modules or voice events, some VoiceGuardian functionality may stop working until the plugin is updated.

VoiceGuardian is dependent on the Discord desktop client and Vencord's internal APIs.

---

## 🐛 Troubleshooting

### Plugin doesn't appear

Check that the file is located at:

```text
src/userplugins/VoiceGuardian/index.ts
```

Then restart/rebuild Vencord and check:

```text
Discord Settings
→ Vencord
→ Plugins
```

---

### Reconnect doesn't work

Check the Vencord console for:

```text
[VoiceGuardian] External disconnect detected.
```

Then:

```text
[VoiceGuardian] Reconnecting to <CHANNEL_ID> in 250ms
```

And:

```text
[VoiceGuardian] Rejoining voice channel: <CHANNEL_ID>
```

If you see:

```text
selectVoiceChannel action not available.
```

Discord's internal module structure may have changed.

---

### Server mute doesn't get removed

Check for:

```text
[VoiceGuardian] Detected external/server mute.
```

Then:

```text
[VoiceGuardian] setServerMute(false) sent.
```

If you see:

```text
setServerMute is not available in Discord's current webpack modules.
```

the current Discord build may expose the action differently.

---

### Server deaf doesn't get removed

Check for:

```text
[VoiceGuardian] Detected external/server deaf.
```

If the corresponding Discord action is unavailable, the current Discord build may expose it differently.

---

## 🤝 Contributing

Bug reports and improvements are welcome.

When reporting an issue, include:

* Discord version
* Vencord version/commit
* VoiceGuardian version/commit
* What happened
* Expected behavior
* Relevant VoiceGuardian console logs

Please do not include:

* Discord tokens
* Passwords
* Personal information
* Private server information
* Other sensitive data

---

## 📜 License

This project is provided for personal and educational use.

See the repository license for the applicable terms.

---

## ⚠️ Disclaimer

VoiceGuardian is an unofficial third-party plugin.

It is:

* Not developed by Discord
* Not affiliated with Discord
* Not an official Vencord plugin
* Dependent on Discord's internal client implementation

Discord and Vencord may change their internal APIs at any time, which can break functionality.

Use it at your own discretion.

---

## 👨‍💻 Author

**Yasser Jabir**

GitHub: **JABIR-YASSER**

---

## 📌 Version

**VoiceGuardian v1.0.0**

### Current Features

* 🔄 Automatic voice reconnect
* 🔇 Server mute recovery
* 🔕 Server deaf recovery
* 🎙️ Self-mute protection
* 🎧 Self-deaf protection
* 🚪 Intentional leave detection
* 🧠 Voice state monitoring
* ⚡ 250ms reconnect delay
* 🔒 Local-only operation

---

> 🛡️ **VoiceGuardian — Stay connected.**
