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

                lastVoiceChannelId =
                    channelId;

                intentionalLeave = false;

                return;
            }

            /*
             * channelId === null
             *
             * Discord also emits this during startup/navigation,
             * so DON'T immediately mark every null event as intentional.
             *
             * We only consider it intentional if there is actually
             * no current voice state for ourselves.
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

            /*
             * If Discord still says we're in the channel,
             * this null selection was navigation noise.
             */
            if (myState?.channelId) {
                log(
                    "Ignoring null channel selection because voice state still shows us connected to:",
                    myState.channelId
                );

                lastVoiceChannelId =
                    myState.channelId;

                intentionalLeave = false;

                return;
            }

            /*
             * We genuinely left.
             */
            intentionalLeave = true;

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
                     * If the user deliberately left,
                     * do NOT reconnect.
                     */
                    if (intentionalLeave) {
                        log(
                            "Disconnect appears intentional. Not reconnecting."
                        );

                        continue;
                    }

                    /*
                     * Otherwise somebody/server disconnected us.
                     */
                    log(
                        "External disconnect detected."
                    );

                    reconnectToLastChannel();
                }
            }
        },
    },

    start() {
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

        log("Started");
    },

    stop() {
        log("Stopped");

        lastVoiceChannelId =
            null;

        intentionalLeave =
            false;

        reconnecting =
            false;
    },
});