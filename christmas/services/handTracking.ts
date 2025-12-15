import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { HandData } from "../types";

export class HandTrackingService {
    private handLandmarker: HandLandmarker | null = null;
    private video: HTMLVideoElement | null = null;
    private lastVideoTime = -1;
    private rafId: number = 0;
    
    // Callback to send data back to React/Three
    public onHandData: (data: HandData) => void = () => {};

    async initialize() {
        // Use unpkg instead of jsdelivr. jsdelivr often fails in certain regions (causing "GitHub" errors).
        const vision = await FilesetResolver.forVisionTasks(
            "https://unpkg.com/@mediapipe/tasks-vision@0.10.9/wasm"
        );
        
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                // If this Google Storage URL fails, you MUST download the file locally
                // and set this path to './hand_landmarker.task'
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 1
        });
    }

    async startWebcam(videoElement: HTMLVideoElement) {
        this.video = videoElement;
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        this.video.srcObject = stream;
        this.video.addEventListener("loadeddata", () => {
            this.predictWebcam();
        });
    }

    private predictWebcam = () => {
        if (!this.handLandmarker || !this.video) return;

        if (this.video.currentTime !== this.lastVideoTime) {
            this.lastVideoTime = this.video.currentTime;
            const startTimeMs = performance.now();
            const result = this.handLandmarker.detectForVideo(this.video, startTimeMs);
            this.processResult(result);
        }
        this.rafId = requestAnimationFrame(this.predictWebcam);
    }

    private processResult(result: HandLandmarkerResult) {
        if (result.landmarks && result.landmarks.length > 0) {
            const landmarks = result.landmarks[0];
            
            // 1. Position (Index finger tip [8] or Wrist [0] or Center)
            const indexTip = landmarks[8];
            const thumbTip = landmarks[4];
            const middleTip = landmarks[12];
            const ringTip = landmarks[16];
            const pinkyTip = landmarks[20];
            const wrist = landmarks[0];

            // 2. Gesture Detection
            // Pinch: Distance between Thumb (4) and Index (8)
            const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
            const isPinching = pinchDist < 0.05;

            // Fist vs Open
            // Check if fingertips are close to wrist
            const fingers = [indexTip, middleTip, ringTip, pinkyTip];
            let foldedCount = 0;
            fingers.forEach(f => {
                const distToWrist = Math.hypot(f.x - wrist.x, f.y - wrist.y);
                if (distToWrist < 0.15) foldedCount++;
            });

            let gesture: HandData['gesture'] = 'OPEN';
            if (foldedCount >= 3) {
                gesture = 'CLOSED';
            } else if (isPinching) {
                gesture = 'PINCH';
            }

            // Emit data
            this.onHandData({
                x: 1 - indexTip.x, // Mirror X
                y: indexTip.y,
                gesture,
                pinchDistance: pinchDist
            });
        } else {
            this.onHandData({ x: 0.5, y: 0.5, gesture: 'NONE', pinchDistance: 1 });
        }
    }

    stop() {
        cancelAnimationFrame(this.rafId);
        if (this.video && this.video.srcObject) {
            const stream = this.video.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
        }
    }
}