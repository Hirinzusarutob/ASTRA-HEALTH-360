
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const stage = document.getElementById("astra-3d-stage");
    const canvas = document.getElementById("astra-3d-canvas");
    const status = document.getElementById("astra-3d-status");

    // Check whether Three.js loaded correctly
    if (!stage || !canvas || !window.THREE) {
        if (status) status.textContent = "3D LIBRARY NOT FOUND";
        console.error("ASTRA 3D: Three.js or canvas not found.");
        return;
    }

    try {
        // 1. Create the scene
        const scene = new THREE.Scene();

        // 2. Create the camera
        const camera = new THREE.PerspectiveCamera(
            45,
            stage.clientWidth / stage.clientHeight,
            0.1,
            100
        );

        camera.position.set(0, 0, 7);

        // 3. Create the renderer
        const renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: true
        });

        renderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, 2)
        );

        renderer.setSize(
            stage.clientWidth,
            stage.clientHeight,
            false
        );

        renderer.setClearColor(0x000000, 0);

        // 4. Add lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
        scene.add(ambientLight);

        const blueLight = new THREE.PointLight(0x00c8ff, 5, 15);
        blueLight.position.set(3, 2, 4);
        scene.add(blueLight);

        const purpleLight = new THREE.PointLight(0x754cff, 4, 15);
        purpleLight.position.set(-3, -2, 3);
        scene.add(purpleLight);

        // 5. Create the ASTRA avatar group
        const avatar = new THREE.Group();
        scene.add(avatar);

        // Main glowing head
        const headGeometry = new THREE.SphereGeometry(1.15, 48, 48);

        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0x087ca8,
            metalness: 0.65,
            roughness: 0.22,
            emissive: 0x00334d,
            emissiveIntensity: 0.8
        });

        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.scale.set(1.05, 0.95, 0.78);
        head.position.y = 0.45;
        avatar.add(head);

        // Dark face panel
        const faceGeometry = new THREE.SphereGeometry(0.85, 40, 40);

        const faceMaterial = new THREE.MeshStandardMaterial({
            color: 0x061525,
            metalness: 0.8,
            roughness: 0.25
        });

        const face = new THREE.Mesh(faceGeometry, faceMaterial);
        face.scale.set(0.92, 0.58, 0.25);
        face.position.set(0, 0.42, 0.83);
        avatar.add(face);

        // Create glowing eyes
        const eyeGeometry = new THREE.SphereGeometry(0.105, 24, 24);

        const eyeMaterial = new THREE.MeshBasicMaterial({
            color: 0x45f5ff
        });

        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.34, 0.47, 1.035);
        avatar.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.34, 0.47, 1.035);
        avatar.add(rightEye);

        // Small glowing mouth
        const mouthGeometry = new THREE.BoxGeometry(0.28, 0.025, 0.025);

        const mouthMaterial = new THREE.MeshBasicMaterial({
            color: 0x00cfff
        });

        const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
        mouth.position.set(0, 0.16, 1.04);
        avatar.add(mouth);

        // Neck
        const neck = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.3, 0.38, 32),
            headMaterial
        );

        neck.position.y = -0.72;
        avatar.add(neck);

        // Upper body
        const body = new THREE.Mesh(
            new THREE.SphereGeometry(0.65, 32, 32),
            new THREE.MeshStandardMaterial({
                color: 0x075078,
                metalness: 0.75,
                roughness: 0.3,
                emissive: 0x002b45
            })
        );

        body.scale.set(1.15, 0.65, 0.55);
        body.position.y = -1.15;
        avatar.add(body);

        // 6. Add rotating orbital rings
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x00cfff,
            transparent: true,
            opacity: 0.7
        });

        const ring1 = new THREE.Mesh(
            new THREE.TorusGeometry(1.65, 0.018, 8, 120),
            ringMaterial
        );

        ring1.rotation.x = 1.15;
        ring1.rotation.y = 0.3;
        ring1.position.y = 0.15;
        avatar.add(ring1);

        const ring2 = new THREE.Mesh(
            new THREE.TorusGeometry(1.85, 0.012, 8, 120),
            new THREE.MeshBasicMaterial({
                color: 0x8055ff,
                transparent: true,
                opacity: 0.65
            })
        );

        ring2.rotation.x = 1.4;
        ring2.rotation.y = -0.5;
        ring2.position.y = 0.15;
        avatar.add(ring2);

        // 7. Add floating particles
        const particleCount = 180;
        const particlePositions = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            particlePositions[i * 3] = (Math.random() - 0.5) * 8;
            particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 5;
            particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 5;
        }

        const particleGeometry = new THREE.BufferGeometry();

        particleGeometry.setAttribute(
            "position",
            new THREE.BufferAttribute(particlePositions, 3)
        );

        const particleMaterial = new THREE.PointsMaterial({
            color: 0x42dfff,
            size: 0.035,
            transparent: true,
            opacity: 0.75
        });

        const particles = new THREE.Points(
            particleGeometry,
            particleMaterial
        );

        scene.add(particles);

        // 8. Animation
        const clock = new THREE.Clock();

        function animate() {
            requestAnimationFrame(animate);

            const time = clock.getElapsedTime();

            // Gentle floating movement
            avatar.position.y = Math.sin(time * 1.2) * 0.12;

            // Slight head rotation
            head.rotation.y = Math.sin(time * 0.6) * 0.12;

            // Rotate the orbital rings
            ring1.rotation.z += 0.003;
            ring2.rotation.z -= 0.002;

            // Slowly rotate the particles
            particles.rotation.y += 0.0008;

            // Render the scene
            renderer.render(scene, camera);
        }

        animate();

        // 9. Adjust the 3D scene when the page resizes
        function resizeScene() {
            const width = stage.clientWidth;
            const height = stage.clientHeight;

            if (!width || !height) return;

            camera.aspect = width / height;
            camera.updateProjectionMatrix();

            renderer.setSize(width, height, false);
        }

        window.addEventListener("resize", resizeScene);

        if (window.ResizeObserver) {
            const observer = new ResizeObserver(resizeScene);
            observer.observe(stage);
        }

        // 10. Show successful status
        if (status) {
            status.textContent = "ASTRA 3D ONLINE";
        }

        console.log("ASTRA 3D avatar initialized successfully.");

    } catch (error) {
        console.error("ASTRA 3D error:", error);

        if (status) {
            status.textContent = "3D INITIALIZATION FAILED";
        }
    }
});
