// Event bridge between ProjectProvider and TrackSessionProvider.
// ProjectProvider is nested INSIDE TrackSessionProvider (see App.tsx), so the
// project layer cannot consume useTrackSession(). These window events keep the
// two layers in sync without circular imports or provider reordering.

export const EVT_ACTIVATE_TRACK = "studio-sensei:activate-track";
export const EVT_TRACK_ACTIVATED = "studio-sensei:track-activated";

/** Project layer → Track layer: "this project's saved track should become active." */
export function requestTrackActivation(reportId: string): void {
  window.dispatchEvent(new CustomEvent(EVT_ACTIVATE_TRACK, { detail: { reportId } }));
}

/** Track layer → Project layer: "this report is now the active track — remember it on the project." */
export function announceTrackActivated(reportId: string): void {
  window.dispatchEvent(new CustomEvent(EVT_TRACK_ACTIVATED, { detail: { reportId } }));
}
