export type DidiFaceKey = "neutral" | "slight" | "open" | "smileOpen" | "happyClosed" | "surprised" | "blink";
export type DidiFaceMood = "idle" | "thinking" | "speaking" | "celebrating";

export const faceTextureUrls = {
  neutral: "/faces/face_neutral.png",
  slight: "/faces/face_slight.png",
  open: "/faces/face_open.png",
  smileOpen: "/faces/face_smile_open.png",
  happyClosed: "/faces/face_happy_closed.png",
  surprised: "/faces/face_surprised.png",
  blink: "/faces/face_blink.png"
} as const satisfies Record<DidiFaceKey, string>;

const speakingFaces = ["neutral", "surprised", "smileOpen", "open"] as const;

export const speakingFaceCount = speakingFaces.length;

export function didiFaceForFrame(mood: DidiFaceMood, lipFrame = 0, blinking = false): DidiFaceKey {
  if (blinking) {
    return "blink";
  }

  switch (mood) {
    case "idle":
      return "open";
    case "thinking":
      return "slight";
    case "celebrating":
      return "happyClosed";
    case "speaking": {
      if (!Number.isFinite(lipFrame)) {
        return speakingFaces[0];
      }

      const index = ((Math.floor(lipFrame) % speakingFaces.length) + speakingFaces.length) % speakingFaces.length;
      return speakingFaces[index] ?? speakingFaces[0];
    }
  }
}
