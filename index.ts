/*
 * VoiceGuardian
 *
 * Automatically:
 * - Rejoins the last voice channel after an external disconnect
 * - Removes server mute applied to yourself
 * - Removes server deaf applied to yourself
 *
 * It does NOT react to your own intentional:
 * - disconnect
 * - self mute
 * - self deaf
 */

import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";

import {
    MediaEngineStore,
    SelectedChannelStore,
    UserStore,
    VoiceStateStore,
} from "@webpack/common";

interface VoiceStateChange {
    userId: string;
    guildId?: string;
    channelId?: string;
    oldChannelId?: string;

    mute: boolean;
    deaf: boolean;

    selfMute: boolean;
    selfDeaf: boolean;

    sessionId?: string;
}

/*
 * Discord's internal voice-channel navigation action.
 *
 * This is the same type of action used by Vencord plugins
 * to join/leave voice channels.
 */
const VoiceChannelActions = findByPropsLazy(
    "selectVoiceChannel",
    "selectChannel"
);

/*
 * Discord's internal server voice moderation action.
 *
 * setServerMute(guildId, userId, mute)
 */
const GuildVoiceActions = findByPropsLazy(
    "setServerMute",
    "setChannel"
);

let lastVoiceChannelId: string | null = null;

/*
 * Prevents our own selectVoiceChannel(null) from being
 * interpreted as an external disconnect.
 */
let intentionalLeave = false;

/*
 * Used when WE initiate a reconnect so the resulting
 * VOICE_CHANNEL_SELECT event doesn't interfere with state.
 */
let reconnecting = false;

/*
 * Used to delay reconnect decisions because Discord may emit
 * VOICE_STATE_UPDATES and VOICE_CHANNEL_SELECT in different orders.
 */
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;

/*
 * True while we are waiting to determine whether a disconnect
 * was intentional or external.
 */
let disconnectPending = false;

/*
 * Runtime wrapper for Discord's voice-channel selection action.
 * This lets us detect the actual user-intent call:
 * selectVoiceChannel(null) = user intentionally disconnecting.
 */
let restoreVoiceChannelAction: (() => void) | null = null;


/* -------------------------------------------------------------------------- */
/* Logging                                                                    */
/* -------------------------------------------------------------------------- */

function log(...args: unknown[]) {
    console.log("[VoiceGuardian]", ...args);
}


/* -------------------------------------------------------------------------- */
/* Current user                                                               */
/* -------------------------------------------------------------------------- */

function getMyUserId(): string | null {
    try {
        return UserStore.getCurrentUser()?.id ?? null;
    } catch {
        return null;
    }
}


/* -------------------------------------------------------------------------- */
/* Current voice channel                                                      */
/* -------------------------------------------------------------------------- */

function getCurrentVoiceChannelId(): string | null {
    try {
        return SelectedChannelStore.getVoiceChannelId() ?? null;
    } catch {
        return null;
    }
}


/* -------------------------------------------------------------------------- */
/* Guild ID                                                                   */
/* -------------------------------------------------------------------------- */

function getGuildIdFromChannel(channelId: string): string | null {
    try {
        const channel = (VoiceStateStore as any)
            ?.getVoiceStatesForChannel;

        // We don't need this fallback if the VOICE_STATE_UPDATE
        // already provides guildId.
        void channel;

        return null;
    } catch {
        return null;
    }
}


/* -------------------------------------------------------------------------- */
/* Server unmute                                                              */
/* -------------------------------------------------------------------------- */

function restoreServerMute(
    guildId: string,
    userId: string
) {
    log("Trying to remove server mute...");
    log("Guild:", guildId);
    log("User:", userId);

    try {
        const actions = GuildVoiceActions as any;

        if (
            actions &&
            typeof actions.setServerMute === "function"
        ) {
            actions.setServerMute(
                guildId,
                userId,
                false
            );

            log("setServerMute(false) sent.");
            return;
        }

        log(
            "setServerMute is not available in Discord's current webpack modules."
        );
    } catch (error) {
        log(
            "Failed to send server unmute:",
            error
        );
    }
}


/* -------------------------------------------------------------------------- */
/* Server undeafen                                                            */
/* -------------------------------------------------------------------------- */

function restoreServerDeaf(
    guildId: string,
    userId: string
) {
    log("Trying to remove server deaf...");

    /*
     * Some Discord builds expose setServerDeaf directly,
     * while others expose the same voice-action module
     * through a different set of properties.
     */

    try {
        const actions = GuildVoiceActions as any;

        if (
            actions &&
            typeof actions.setServerDeaf === "function"
        ) {
            actions.setServerDeaf(
                guildId,
                userId,
                false
            );

            log("setServerDeaf(false) sent.");
            return;
        }

        log(
            "setServerDeaf is not available in the server voice action module."
        );
    } catch (error) {
        log(
            "Failed to send server undeafen:",
            error
        );
    }
}


/* -------------------------------------------------------------------------- */
/* Local self-mute fallback                                                   */
/* -------------------------------------------------------------------------- */

function restoreSelfMute() {
    try {
        const mediaEngine =
            MediaEngineStore.getMediaEngine();

        const myUserId = getMyUserId();

        if (!myUserId) {
            log("Could not get current user.");
            return;
        }

        const connection = [
            ...mediaEngine.connections
        ].find(
            connection =>
                connection.userId === myUserId &&
                connection.context === "default"
        );

        if (!connection) {
            log(
                "No active media connection available for self-unmute."
            );
            return;
        }

        connection.setSelfMute(false);

        log(
            "setSelfMute(false) sent."
        );
    } catch (error) {
        log(
            "Failed to restore self-mute state:",
            error
        );
    }
}


/* -------------------------------------------------------------------------- */
/* Local self-deaf fallback                                                   */
/* -------------------------------------------------------------------------- */

function restoreSelfDeaf() {
    try {
        const mediaEngine =
            MediaEngineStore.getMediaEngine();

        const myUserId = getMyUserId();

        if (!myUserId) {
            log("Could not get current user.");
            return;
        }

        const connection = [
            ...mediaEngine.connections
        ].find(
            connection =>
                connection.userId === myUserId &&
                connection.context === "default"
        );

        if (!connection) {
            log(
                "No active media connection available for self-undeafen."
            );
            return;
        }

        connection.setSelfDeaf(false);

        log(
            "setSelfDeaf(false) sent."
        );
    } catch (error) {
        log(
            "Failed to restore self-deaf state:",
            error
        );
    }
}


/* -------------------------------------------------------------------------- */
/* Reconnect                                                                  */
/* -------------------------------------------------------------------------- */

function reconnectToLastChannel() {
    if (!lastVoiceChannelId) {
        log(
            "No previous voice channel available for reconnect."
        );
        return;
    }

    if (intentionalLeave) {
        log(
            "Reconnect cancelled because the disconnect was intentional."
        );
        return;
    }

    const currentChannel =
        getCurrentVoiceChannelId();

    if (currentChannel === lastVoiceChannelId) {
        log(
            "Already back in the voice channel."
        );
        return;
    }

    const channelId =
        lastVoiceChannelId;

    log(
        `Reconnecting to ${channelId} in 250ms`
    );

    setTimeout(() => {
        /*
         * Check again because Discord may have reconnected
         * by itself during the delay.
         */
        if (
            getCurrentVoiceChannelId() === channelId
        ) {
            log(
                "Discord already reconnected. Nothing to do."
            );
            return;
        }

        if (intentionalLeave) {
            log(
                "Reconnect cancelled because the disconnect became intentional."
            );
            return;
        }

        reconnecting = true;

        try {
            const actions =
                VoiceChannelActions as any;

            if (
                actions &&
                typeof actions.selectVoiceChannel ===
                    "function"
            ) {
                log(
                    `Rejoining voice channel: ${channelId}`
                );

                actions.selectVoiceChannel(
                    channelId
                );
            } else {
                log(
                    "selectVoiceChannel action not available."
                );
            }
        } catch (error) {
            log(
                "Failed to reconnect:",
                error
            );
        }

        setTimeout(() => {
            reconnecting = false;
        }, 2000);

    }, 250);
}


/* -------------------------------------------------------------------------- */
/* Intent detection                                                           */
/* -------------------------------------------------------------------------- */

function installVoiceIntentPatch() {
    if (restoreVoiceChannelAction) {
        return;
    }

    try {
        const actions = VoiceChannelActions as any;
        const original = actions?.selectVoiceChannel;

        if (typeof original !== "function") {
            log("selectVoiceChannel action is not available for intent detection.");
            return;
        }

        const wrapped = function (this: unknown, ...args: any[]) {
            const channelId = args[0] ?? null;

            if (!reconnecting && channelId == null) {
                intentionalLeave = true;
                disconnectPending = false;

                if (disconnectTimer) {
                    clearTimeout(disconnectTimer);
                    disconnectTimer = null;
                }

                log("User initiated voice disconnect.");
            }

            if (!reconnecting && channelId != null) {
                intentionalLeave = false;

                if (disconnectTimer) {
                    clearTimeout(disconnectTimer);
                    disconnectTimer = null;
                }

                disconnectPending = false;
            }

            return original.apply(this, args);
        };

        actions.selectVoiceChannel = wrapped;

        restoreVoiceChannelAction = () => {
            try {
                if (actions.selectVoiceChannel === wrapped) {
                    actions.selectVoiceChannel = original;
                }
            } catch (error) {
                log("Failed to restore selectVoiceChannel action:", error);
            }

            restoreVoiceChannelAction = null;
        };

        log("Installed voice disconnect intent detection.");
    } catch (error) {
        log("Failed to install voice disconnect intent detection:", error);
    }
}


/* -------------------------------------------------------------------------- */
/* Plugin                                                                     */
/* -------------------------------------------------------------------------- */

export default definePlugin({
    name: "VoiceGuardian",

    description:
        "Automatically rejoins voice after external disconnects and restores server mute/deaf state.",

    authors: [
        {
            name: "Yasser Jabir",
            id: 0n,
        },
    ],

    flux: {

        /* ------------------------------------------------------------------ */
        /* Voice channel navigation                                            */
        /* ------------------------------------------------------------------ */

        VOICE_CHANNEL_SELECT({
            channelId,
        }: {
            channelId: string | null;
        }) {
            log(
                "VOICE_CHANNEL_SELECT:",
                channelId
            );

            /*
             * Ignore the event generated by our own reconnect.
             */
            if (reconnecting) {
                log(
                    "Voice channel selection came from reconnect."
                );

                if (channelId) {
                    lastVoiceChannelId =
                        channelId;
                }

                return;
            }

            /*
             * Joining / selecting a voice channel.
             */
            if (channelId) {
                log(
                    "Voice channel selected:",
                    channelId
                );

                /*
                 * If a disconnect is currently pending and Discord emits
                 * the same channel ID again, do NOT clear intentionalLeave.
                 * Discord can emit this event after the user clicks
                 * Disconnect, and that used to make VoiceGuardian think
                 * the disconnect was external.
                 */
                if (disconnectPending) {
                    if (channelId !== lastVoiceChannelId) {
                        /*
                         * The user selected a different channel while a
                         * reconnect decision was pending. The old reconnect
                         * must be cancelled.
                         */
                        if (disconnectTimer) {
                            clearTimeout(disconnectTimer);
                            disconnectTimer = null;
                        }

                        disconnectPending = false;
                        intentionalLeave = false;
                        lastVoiceChannelId = channelId;

                        log(
                            "Different voice channel selected while disconnect was pending. Reconnect cancelled."
                        );
                    } else {
                        log(
                            "Same voice channel selected during pending disconnect. Keeping disconnect state unchanged."
                        );
                    }

                    return;
                }

                lastVoiceChannelId =
                    channelId;

                intentionalLeave = false;

                return;
            }

            /*
             * channelId === null
             *
             * A null selection can happen during normal Discord navigation,
             * so only treat it as an intentional leave when Discord is no
             * longer reporting us as connected.
             */
            const myUserId =
                getMyUserId();

            if (!myUserId) {
                return;
            }

            const myState =
                VoiceStateStore.getVoiceStateForUser(
                    myUserId
                );

            if (myState?.channelId) {
                log(
                    "Ignoring null channel selection because voice state still shows us connected to:",
                    myState.channelId
                );

                return;
            }

            /*
             * We genuinely left.
             */
            intentionalLeave = true;

            if (disconnectTimer) {
                clearTimeout(disconnectTimer);
                disconnectTimer = null;
            }

            disconnectPending = false;

            log(
                "User intentionally disconnected from:",
                lastVoiceChannelId
            );
        },


        /* ------------------------------------------------------------------ */
        /* Voice state updates                                                  */
        /* ------------------------------------------------------------------ */

        VOICE_STATE_UPDATES({
            voiceStates,
        }: {
            voiceStates: VoiceStateChange[];
        }) {
            const myUserId =
                getMyUserId();

            if (!myUserId) {
                return;
            }

            for (const state of voiceStates) {

                /*
                 * We only care about OUR voice state.
                 */
                if (
                    state.userId !== myUserId
                ) {
                    continue;
                }

                log(
                    "Voice state update:",
                    state
                );

                const {
                    channelId,
                    oldChannelId,
                    mute,
                    deaf,
                    selfMute,
                    selfDeaf,
                } = state;

                /* ---------------------------------------------------------- */
                /* Connected                                                    */
                /* ---------------------------------------------------------- */

                if (channelId) {
                    if (disconnectTimer) {
                        clearTimeout(disconnectTimer);
                        disconnectTimer = null;
                    }

                    disconnectPending = false;

                    lastVoiceChannelId =
                        channelId;

                    intentionalLeave = false;

                    log(
                        "Currently connected to:",
                        channelId
                    );

                    /*
                     * ------------------------------------------------------
                     * SERVER MUTE
                     * ------------------------------------------------------
                     *
                     * IMPORTANT:
                     *
                     * mute === true
                     * selfMute === false
                     *
                     * means Discord/server muted us.
                     *
                     * We DO NOT use setSelfMute(false) here.
                     *
                     * We use Discord's server voice action instead.
                     */

                    if (
                        mute &&
                        !selfMute
                    ) {
                        log(
                            "Detected external/server mute."
                        );

                        /*
                         * guildId is not part of every
                         * VoiceStateChange type, but Discord's
                         * runtime event normally includes it.
                         */
                        const guildId =
                            state.guildId;

                        if (guildId) {
                            restoreServerMute(
                                guildId,
                                myUserId
                            );
                        } else {
                            log(
                                "Could not determine guildId for server unmute."
                            );
                        }
                    }


                    /* ------------------------------------------------------ */
                    /* SERVER DEAF                                               */
                    /* ------------------------------------------------------ */

                    if (
                        deaf &&
                        !selfDeaf
                    ) {
                        log(
                            "Detected external/server deaf."
                        );

                        const guildId =
                            state.guildId;

                        if (guildId) {
                            restoreServerDeaf(
                                guildId,
                                myUserId
                            );
                        } else {
                            log(
                                "Could not determine guildId for server undeafen."
                            );
                        }
                    }


                    /*
                     * If we are self-muted/self-deafened,
                     * DO NOTHING.
                     *
                     * This is intentional.
                     *
                     * VoiceGuardian must not fight the user.
                     */
                    if (
                        selfMute
                    ) {
                        log(
                            "Self-mute detected. Leaving it unchanged."
                        );
                    }

                    if (
                        selfDeaf
                    ) {
                        log(
                            "Self-deaf detected. Leaving it unchanged."
                        );
                    }

                    continue;
                }


                /* ---------------------------------------------------------- */
                /* Disconnected                                                */
                /* ---------------------------------------------------------- */

                if (
                    !channelId &&
                    oldChannelId
                ) {
                    log(
                        "Disconnected from voice channel:",
                        oldChannelId
                    );

                    /*
                     * If Discord has already told us that the leave was
                     * intentional, cancel any pending reconnect immediately.
                     */
                    if (intentionalLeave) {
                        log(
                            "Disconnect appears intentional. Not reconnecting."
                        );

                        if (disconnectTimer) {
                            clearTimeout(disconnectTimer);
                            disconnectTimer = null;
                        }

                        disconnectPending = false;
                        continue;
                    }

                    /*
                     * Discord can emit VOICE_STATE_UPDATES before
                     * VOICE_CHANNEL_SELECT. Wait briefly before deciding
                     * whether the disconnect was external.
                     */
                    disconnectPending = true;

                    if (disconnectTimer) {
                        clearTimeout(disconnectTimer);
                    }

                    log(
                        "Waiting 300ms to determine whether the disconnect was intentional..."
                    );

                    disconnectTimer = setTimeout(() => {
                        disconnectTimer = null;

                        if (!disconnectPending) {
                            return;
                        }

                        disconnectPending = false;

                        if (intentionalLeave) {
                            log(
                                "Disconnect confirmed as intentional. Reconnect disabled."
                            );
                            return;
                        }

                        log(
                            "External disconnect confirmed."
                        );

                        reconnectToLastChannel();
                    }, 300);
                }
            }
        },
    },

    start() {
        /*
         * Detect the user's explicit Disconnect action before the
         * resulting VOICE_STATE_UPDATE reaches the plugin.
         */
        installVoiceIntentPatch();

        /*
         * Capture the current voice channel immediately.
         */
        const currentChannel =
            getCurrentVoiceChannelId();

        if (currentChannel) {
            lastVoiceChannelId =
                currentChannel;

            log(
                "Selected voice channel:",
                currentChannel
            );
        }

        disconnectPending = false;
        intentionalLeave = false;

        if (disconnectTimer) {
            clearTimeout(disconnectTimer);
            disconnectTimer = null;
        }

        log("Started");
    },

    stop() {
        log("Stopped");

        if (disconnectTimer) {
            clearTimeout(disconnectTimer);
            disconnectTimer = null;
        }

        disconnectPending = false;

        lastVoiceChannelId =
            null;

        intentionalLeave =
            false;

        reconnecting =
            false;
    },
});