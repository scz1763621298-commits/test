import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HandTrackingService } from '../services/handTracking';
import { AppMode, HandData, ParticleType } from '../types';

// --- Configuration ---
const CONFIG = {
    colors: {
        bg: 0x020210, // Deep Midnight Blue
        gold: 0xffd966,
        green: 0x032b12,
        red: 0xd00000,
        white: 0xffffff,
    },
    particles: {
        count: 800,
        treeHeight: 25,
        treeRadius: 9,
    },
    camera: { z: 45 }
};

interface ExperienceProps {
    uploadedImages: string[];
    onCameraReady: (video: HTMLVideoElement) => void;
    onError: (error: string) => void;
}

export const Experience: React.FC<ExperienceProps> = ({ uploadedImages, onCameraReady, onError }) => {
    const mountRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(document.createElement('video'));
    const handService = useRef(new HandTrackingService());
    const [mode, setMode] = useState<AppMode>(AppMode.SCATTER);
    
    // Track how many images we have already added to the scene
    const processedImagesCount = useRef(0);

    // Refs for animation loop access without re-rendering
    const stateRef = useRef({
        mode: AppMode.SCATTER,
        handData: { x: 0.5, y: 0.5, gesture: 'NONE', pinchDistance: 1 } as HandData,
        focusTarget: null as THREE.Object3D | null,
        particles: [] as any[],
        rotationX: 0,
        rotationY: 0,
        targetRotationX: 0,
        targetRotationY: 0,
        smoothedPinch: 0.05, 
    });

    useEffect(() => {
        // --- 1. Scene Setup ---
        const container = mountRef.current;
        if (!container) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(CONFIG.colors.bg);
        scene.fog = new THREE.FogExp2(CONFIG.colors.bg, 0.02);

        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        const isPortrait = window.innerHeight > window.innerWidth;
        camera.position.set(0, 2, isPortrait ? 75 : CONFIG.camera.z);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        
        // --- Key Adjustment 1: Exposure Control ---
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.9; 
        
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        // --- 2. Post Processing ---
        const renderScene = new RenderPass(scene, camera);
        
        // --- Key Adjustment 2: VERY High Threshold ---
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
        bloomPass.threshold = 0.85; 
        bloomPass.strength = 1.2; 
        bloomPass.radius = 0.6;

        const composer = new EffectComposer(renderer);
        composer.addPass(renderScene);
        composer.addPass(bloomPass);

        // --- 3. Lighting ---
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
        scene.add(ambientLight);

        // Center Tree Light 
        const bulbLight = new THREE.PointLight(0xffaa00, 5, 80);
        bulbLight.position.set(0, 5, 0);
        bulbLight.castShadow = true;
        scene.add(bulbLight);

        // Front Fill Light 
        const frontLight = new THREE.DirectionalLight(0xffeedd, 1.0);
        frontLight.position.set(0, 10, 50);
        scene.add(frontLight);

        // Colored Side Lights
        const blueLight = new THREE.PointLight(0x4488ff, 4, 60);
        blueLight.position.set(-25, 10, 15);
        scene.add(blueLight);
        
        const redLight = new THREE.PointLight(0xff4444, 4, 60);
        redLight.position.set(25, -10, 15);
        scene.add(redLight);

        // Star Top
        const starGeo = new THREE.IcosahedronGeometry(1.2, 0);
        const starMat = new THREE.MeshStandardMaterial({
            color: 0xffdd44,
            emissive: 0xffaa00,
            emissiveIntensity: 15, // High intensity for bloom
            metalness: 0.9,
            roughness: 0.1
        });
        const starMesh = new THREE.Mesh(starGeo, starMat);
        starMesh.position.set(0, CONFIG.particles.treeHeight / 2 + 1, 0);
        scene.add(starMesh);

        // --- Snow System ---
        const snowCount = 1200;
        const snowGeo = new THREE.BufferGeometry();
        const snowPos = new Float32Array(snowCount * 3);
        const snowVel = new Float32Array(snowCount);
        for(let i=0; i<snowCount; i++) {
            snowPos[i*3] = (Math.random() - 0.5) * 70; 
            snowPos[i*3+1] = (Math.random() - 0.5) * 70; 
            snowPos[i*3+2] = (Math.random() - 0.5) * 50; 
            snowVel[i] = 0.03 + Math.random() * 0.08; 
        }
        snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if(ctx) {
            const grad = ctx.createRadialGradient(16,16,0, 16,16,16);
            grad.addColorStop(0, 'rgba(255,255,255,1)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0,0,32,32);
        }
        const snowTex = new THREE.CanvasTexture(canvas);
        const snowMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.5,
            map: snowTex,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const snowSystem = new THREE.Points(snowGeo, snowMat);
        scene.add(snowSystem);

        // Main Group
        const mainGroup = new THREE.Group();
        scene.add(mainGroup);

        // Visual Cursor
        const cursorGeo = new THREE.RingGeometry(0.5, 0.6, 32);
        const cursorMat = new THREE.MeshBasicMaterial({ color: 0xffd966, side: THREE.DoubleSide, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
        const cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
        cursorMesh.position.z = 20; 
        scene.add(cursorMesh);

        // --- 4. Assets & Materials ---
        const createEmojiTexture = (emoji: string) => {
            const canvas = document.createElement('canvas');
            canvas.width = 256; canvas.height = 256;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.font = '180px serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = '#ffd700';
                ctx.shadowBlur = 30;
                ctx.fillStyle = 'white';
                ctx.fillText(emoji, 128, 128);
            }
            const tex = new THREE.CanvasTexture(canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            return tex;
        };

        const ornamentProps = {
            metalness: 0.6,
            roughness: 0.2,
            envMapIntensity: 1.2,
            side: THREE.DoubleSide,
            transparent: true,
            emissive: 0x222222,
            emissiveIntensity: 1.0, 
        };

        const materials: Record<string, THREE.Material> = {
            GOLD: new THREE.MeshStandardMaterial({ 
                color: CONFIG.colors.gold, 
                metalness: 1.0, 
                roughness: 0.1,
                emissive: 0xff8800,
                emissiveIntensity: 10.0 
            }),
            RED: new THREE.MeshPhysicalMaterial({ 
                color: CONFIG.colors.red, 
                metalness: 0.6, 
                roughness: 0.2, 
                clearcoat: 1.0, 
                emissive: 0x880000,
                emissiveIntensity: 10.0 
            }),
            GREEN: new THREE.MeshStandardMaterial({ 
                color: CONFIG.colors.green, 
                metalness: 0.5, 
                roughness: 0.4,
                emissive: 0x004400,
                emissiveIntensity: 3.0
            }),
            GIFT: new THREE.MeshStandardMaterial({ map: createEmojiTexture('🎁'), ...ornamentProps }),
            SOCK: new THREE.MeshStandardMaterial({ map: createEmojiTexture('🧦'), ...ornamentProps }),
            BELL: new THREE.MeshStandardMaterial({ map: createEmojiTexture('🔔'), ...ornamentProps, emissiveIntensity: 5.0 }),
            TIE: new THREE.MeshStandardMaterial({ map: createEmojiTexture('👔'), ...ornamentProps }),
            TREE: new THREE.MeshStandardMaterial({ map: createEmojiTexture('🎄'), ...ornamentProps }),
            SANTA: new THREE.MeshStandardMaterial({ map: createEmojiTexture('🎅'), ...ornamentProps }),
        };

        const geometries = {
            SPHERE: new THREE.SphereGeometry(0.4, 32, 32),
            CUBE: new THREE.BoxGeometry(0.5, 0.5, 0.5),
            TRIANGLE: new THREE.TetrahedronGeometry(0.55),
            PLANE: new THREE.PlaneGeometry(0.8, 0.8)
        };

        // --- 5. Particle System ---
        const particles: any[] = [];
        const photoGroup = new THREE.Group();
        mainGroup.add(photoGroup);

        const getTreePos = () => {
            const h = CONFIG.particles.treeHeight;
            let t = Math.pow(Math.random(), 0.8);
            const y = (t * h) - (h / 2);
            const rMax = CONFIG.particles.treeRadius * (1.0 - t);
            const angle = Math.random() * Math.PI * 2;
            const r = rMax * (0.4 + Math.random() * 0.6); 
            return new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
        };

        const getScatterPos = () => {
            const vec = new THREE.Vector3();
            const r = 12 + Math.random() * 20;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            vec.x = r * Math.sin(phi) * Math.cos(theta);
            vec.y = r * Math.sin(phi) * Math.sin(theta);
            vec.z = r * Math.cos(phi);
            return vec;
        };

        const types: ParticleType[] = ['SPHERE', 'CUBE', 'TRIANGLE', 'GIFT', 'SOCK', 'BELL', 'TIE', 'TREE', 'SANTA'];
        
        for (let i = 0; i < CONFIG.particles.count; i++) {
            const type = types[Math.floor(Math.random() * types.length)];
            let mesh;

            if (['GIFT', 'SOCK', 'BELL', 'TIE', 'TREE', 'SANTA'].includes(type)) {
                mesh = new THREE.Mesh(geometries.PLANE, materials[type]);
            } else if (type === 'SPHERE') {
                mesh = new THREE.Mesh(geometries.SPHERE, materials.GOLD);
            } else if (type === 'TRIANGLE') {
                mesh = new THREE.Mesh(geometries.TRIANGLE, materials.GREEN);
            } else {
                mesh = new THREE.Mesh(geometries.CUBE, materials.RED);
            }

            const spin = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).multiplyScalar(0.02);
            mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);

            mainGroup.add(mesh);
            particles.push({
                mesh,
                type,
                treePos: getTreePos(),
                scatterPos: getScatterPos(),
                spin,
                baseScale: 0.8 + Math.random() * 0.6,
                isPhoto: false
            });
        }

        stateRef.current.particles = particles;

        // --- 7. Hand Tracking ---
        const videoEl = videoRef.current;
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        
        handService.current.initialize().then(() => {
            handService.current.startWebcam(videoEl);
            onCameraReady(videoEl);
        }).catch((err) => {
            console.error("Failed to initialize hand tracking:", err);
            onError("Failed to load AI Model. Please check your internet connection.");
        });

        handService.current.onHandData = (data) => {
            stateRef.current.handData = data;
            const currentMode = stateRef.current.mode;
            
            if (data.gesture === 'CLOSED') {
                stateRef.current.mode = AppMode.TREE;
                stateRef.current.focusTarget = null;
            } else if (data.gesture === 'OPEN') {
                if (currentMode !== AppMode.FOCUS || data.pinchDistance > 0.4) {
                    stateRef.current.mode = AppMode.SCATTER;
                    stateRef.current.focusTarget = null;
                }
            }
            setMode(stateRef.current.mode);
        };

        const raycaster = new THREE.Raycaster();
        const cursorVec = new THREE.Vector2();
        const clock = new THREE.Clock();
        
        // --- 9. Animation Loop ---
        const animate = () => {
            requestAnimationFrame(animate);
            const delta = clock.getDelta();
            const elapsed = clock.getElapsedTime();
            const { mode, handData, particles, focusTarget } = stateRef.current;

            stateRef.current.smoothedPinch += (handData.pinchDistance - stateRef.current.smoothedPinch) * 0.1;
            const pinchVal = stateRef.current.smoothedPinch;

            // -- Atmosphere Breathing --
            const breath = Math.sin(elapsed * 2) * 0.1 + 0.9;
            
            // --- DYNAMIC LIGHTING CONTROL ---
            const isFocus = mode === AppMode.FOCUS;
            const targetStarEmissive = isFocus ? 0.0 : 15.0; 
            const targetBulbBase = isFocus ? 0.5 : 5.0;

            // Smoothly transition intensity
            starMat.emissiveIntensity = THREE.MathUtils.lerp(starMat.emissiveIntensity, targetStarEmissive, delta * 3);
            bulbLight.intensity = THREE.MathUtils.lerp(bulbLight.intensity, targetBulbBase * breath, delta * 3);

            // -- Snow --
            const snowPositions = snowSystem.geometry.attributes.position.array as Float32Array;
            for(let i=0; i<snowCount; i++) {
                snowPositions[i*3+1] -= snowVel[i];
                snowPositions[i*3] += Math.sin(elapsed + i) * 0.01;
                if (snowPositions[i*3+1] < -25) {
                    snowPositions[i*3+1] = 25;
                    snowPositions[i*3] = (Math.random() - 0.5) * 70;
                    snowPositions[i*3+2] = (Math.random() - 0.5) * 50;
                }
            }
            snowSystem.geometry.attributes.position.needsUpdate = true;

            // -- Hand Rotation --
            const targetRotY = (handData.x - 0.5) * 3; 
            const targetRotX = (handData.y - 0.5) * 1.5;
            stateRef.current.rotationY += (targetRotY - stateRef.current.rotationY) * 2.5 * delta;
            stateRef.current.rotationX += (targetRotX - stateRef.current.rotationX) * 2.5 * delta;

            mainGroup.rotation.y = stateRef.current.rotationY;
            mainGroup.rotation.x = stateRef.current.rotationX;

            if (mode === AppMode.SCATTER && handData.gesture === 'NONE') {
                 mainGroup.rotation.y += 0.1 * delta;
            }

            // -- Interaction Cursor Update --
            cursorVec.set( (handData.x * 2) - 1, -(handData.y * 2) + 1 );
            const cursorDist = 15;
            const cursor3D = new THREE.Vector3(cursorVec.x, cursorVec.y, 0.5).unproject(camera);
            const dir = cursor3D.sub(camera.position).normalize();
            const targetCursorPos = camera.position.clone().add(dir.multiplyScalar(cursorDist));
            cursorMesh.position.lerp(targetCursorPos, 12 * delta);
            cursorMesh.lookAt(camera.position);
            
            if (focusTarget) {
                (cursorMesh.material as THREE.MeshBasicMaterial).color.setHex(0x00ff00); 
                cursorMesh.scale.setScalar(0.8);
            } else if (handData.gesture === 'PINCH') {
                (cursorMesh.material as THREE.MeshBasicMaterial).color.setHex(0xff0000); 
                cursorMesh.scale.setScalar(0.5);
            } else {
                (cursorMesh.material as THREE.MeshBasicMaterial).color.setHex(0xffd966); 
                cursorMesh.scale.setScalar(1);
            }

            // -- Raycasting Logic --
            if (handData.gesture === 'PINCH' && !focusTarget) {
                raycaster.setFromCamera(cursorVec, camera);
                const photos = particles.filter(p => p.isPhoto).map(p => p.mesh);
                const intersects = raycaster.intersectObjects(photos, true); 
                
                if (intersects.length > 0) {
                    let target = intersects[0].object;
                    while(target.parent && target.parent !== mainGroup && target.parent !== photoGroup) {
                         const isRoot = particles.some(p => p.mesh === target.parent);
                         if (isRoot) target = target.parent;
                         else if (target.parent) target = target.parent;
                         else break;
                    }

                    const particle = particles.find(p => p.mesh === target);
                    if (particle) {
                        stateRef.current.mode = AppMode.FOCUS;
                        stateRef.current.focusTarget = particle.mesh;
                        setMode(AppMode.FOCUS);
                    }
                }
            }

            // -- Particle Updates --
            particles.forEach((p, i) => {
                let targetPos = new THREE.Vector3();
                let targetScale = p.baseScale;
                
                if (stateRef.current.mode === AppMode.TREE) {
                    targetPos.copy(p.treePos);
                    targetPos.y += Math.sin(elapsed * 1.5 + i * 0.1) * 0.1;
                    if (!p.isPhoto && p.type !== 'SPHERE' && p.type !== 'CUBE' && p.type !== 'TRIANGLE') {
                        const lookTarget = new THREE.Vector3(p.treePos.x * 2, p.treePos.y, p.treePos.z * 2);
                        p.mesh.lookAt(lookTarget);
                    } else {
                        p.mesh.rotation.x += delta * 0.5;
                        p.mesh.rotation.y += delta * 0.5;
                    }
                } else if (stateRef.current.mode === AppMode.SCATTER) {
                    targetPos.copy(p.scatterPos);
                    targetPos.y += Math.sin(elapsed * 0.8 + i) * 0.3;
                    p.mesh.rotation.x += p.spin.x;
                    p.mesh.rotation.y += p.spin.y;
                } else if (stateRef.current.mode === AppMode.FOCUS) {
                    if (p.mesh === stateRef.current.focusTarget) {
                        const invRot = mainGroup.quaternion.clone().invert();
                        const camPos = new THREE.Vector3(0, 0, 30);
                        camPos.applyQuaternion(invRot);
                        
                        targetPos.copy(camPos);
                        
                        const zoomFactor = THREE.MathUtils.clamp(pinchVal, 0.0, 0.4);
                        targetScale = 5 + (zoomFactor * 12); 
                        
                        p.mesh.lookAt(camera.position);

                        if (p.transitionType === 1) {
                            p.mesh.rotation.z = Math.sin(elapsed) * 0.1;
                        }
                    } else {
                        targetPos.copy(p.scatterPos).multiplyScalar(1.8);
                        targetScale = 0;
                    }
                }

                const lerpSpeed = p.isPhoto ? 6 : 4; 
                p.mesh.position.lerp(targetPos, lerpSpeed * delta);
                
                const currentScale = p.mesh.scale.x;
                const nextScale = THREE.MathUtils.lerp(currentScale, targetScale, 5 * delta);
                p.mesh.scale.setScalar(nextScale);
            });

            if (starMesh) {
                starMesh.rotation.y -= delta;
                starMesh.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.15);
            }
            
            composer.render();
        };

        const animId = requestAnimationFrame(animate);

        const handleResize = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
            composer.setSize(width, height);

            const isPortrait = height > width;
            camera.position.z = isPortrait ? 75 : 45;
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animId);
            handService.current.stop();
            if (container) container.removeChild(renderer.domElement);
            renderer.dispose();
        };
    }, []);

    // Listener for Adding Photos
    useEffect(() => {
        const handler = (e: any) => {
            const { mesh } = e.detail;
            const h = CONFIG.particles.treeHeight;
            let t = Math.pow(Math.random(), 0.8);
            const y = (t * h) - (h / 2);
            const rMax = CONFIG.particles.treeRadius * (1.0 - t);
            const angle = Math.random() * Math.PI * 2;
            const r = rMax * 0.8; 
            const treePos = new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);

            const newParticle = {
                mesh,
                type: 'PHOTO',
                treePos: treePos,
                scatterPos: mesh.position.clone(),
                spin: new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, 0).multiplyScalar(0.02),
                baseScale: 1.0,
                isPhoto: true,
                transitionType: Math.floor(Math.random() * 3)
            };
            
            if (stateRef.current.particles.length > 0) {
                const parent = stateRef.current.particles[0].mesh.parent;
                if (parent) {
                    parent.add(mesh);
                    stateRef.current.particles.push(newParticle);
                }
            }
        };
        window.addEventListener('add-photo', handler);
        return () => window.removeEventListener('add-photo', handler);
    }, []);

    // Prop Listener for Uploads (BATCH PROCESSING)
    useEffect(() => {
         // Process any new images that haven't been processed yet
         const newImages = uploadedImages.slice(processedImagesCount.current);
         
         if (newImages.length > 0) {
            newImages.forEach(imageUrl => {
                const img = new Image();
                img.onload = () => {
                    const tex = new THREE.Texture(img);
                    tex.colorSpace = THREE.SRGBColorSpace;
                    tex.needsUpdate = true;
                    
                    // Calculate dimensions
                    const aspect = img.width / img.height;
                    let w = 3;
                    let h = 3 / aspect;
                    if (aspect < 1) {
                        h = 3;
                        w = 3 * aspect;
                    }

                    // --- Key Adjustment 4: Anti-Overexposure Material ---
                    const mesh = new THREE.Mesh(
                        new THREE.PlaneGeometry(w, h),
                        new THREE.MeshBasicMaterial({ 
                            map: tex, 
                            side: THREE.DoubleSide,
                            color: 0xcccccc 
                        })
                    );
                    
                    const frameGeo = new THREE.PlaneGeometry(w+0.15, h+0.15);
                    const frameMat = new THREE.MeshStandardMaterial({ 
                        color: 0xffd966, 
                        metalness: 0.9, 
                        roughness: 0.2, 
                        emissive: 0xffaa00,
                        emissiveIntensity: 1.0 
                    });
                    const frame = new THREE.Mesh(frameGeo, frameMat);
                    frame.position.z = -0.02;
                    mesh.add(frame);
                    
                    // Hitbox
                    const hitGeo = new THREE.SphereGeometry(Math.max(w, h) * 0.8);
                    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
                    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
                    mesh.add(hitMesh); 

                    const vec = new THREE.Vector3();
                    const r = 20 + Math.random() * 10;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(2 * Math.random() - 1);
                    vec.x = r * Math.sin(phi) * Math.cos(theta);
                    vec.y = r * Math.sin(phi) * Math.sin(theta);
                    vec.z = r * Math.cos(phi);
                    mesh.position.copy(vec);

                    const event = new CustomEvent('add-photo', { detail: { mesh, url: imageUrl } });
                    window.dispatchEvent(event);
                };
                img.src = imageUrl;
            });
            
            // Update cursor
            processedImagesCount.current = uploadedImages.length;
         }
    }, [uploadedImages]);

    return <div ref={mountRef} className="w-full h-full absolute top-0 left-0 z-0" />;
};