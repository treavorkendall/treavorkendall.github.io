
const imageUpload = document.getElementById('imageUpload');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const loadingDiv = document.getElementById('loading');
const showLandmarksCheckbox = document.getElementById('showLandmarks');
const showLabelsCheckbox = document.getElementById('showLabels');
const showFullPoseCheckbox = document.getElementById('showFullPose');
const editModeCheckbox = document.getElementById('editMode');
const resetBtn = document.getElementById('resetBtn');
const resetViewBtn = document.getElementById('resetViewBtn');
const modelSelect = document.getElementById('modelSelect');
const exportCombinedBtn = document.getElementById('exportCombinedBtn');
const exportSkeletonBtn = document.getElementById('exportSkeletonBtn');
const skeletonBgSelect = document.getElementById('skeletonBgSelect');
const canvasContainer = document.querySelector('.canvas-container');

let currentImage = null;
let landmarks = []; // Array of { name, x, y, visible }
let originalLandmarks = []; // For reset
let rawPoseLandmarks = null; // Store raw landmarks for full pose
let isDragging = false;
let isPanning = false;
let dragIndex = -1;
let startPan = { x: 0, y: 0 };

// Viewport State
let view = {
    scale: 1,
    x: 0,
    y: 0
};

// Models state
let currentModel = 'mediapipe';
let mediaPipePose = null;
let moveNetDetector = null;

// --- Initialization ---

function initCanvas() {
    // Set canvas size to match container
    canvas.width = canvasContainer.clientWidth;
    canvas.height = canvasContainer.clientHeight;
}

window.addEventListener('resize', () => {
    if (currentImage) {
        initCanvas();
        draw();
    }
});

async function initMediaPipe() {
    if (mediaPipePose) return;
    mediaPipePose = new Pose({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        }
    });
    mediaPipePose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    mediaPipePose.onResults(onMediaPipeResults);
}

async function initMoveNet() {
    if (moveNetDetector) return;
    const detectorConfig = {modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING};
    moveNetDetector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, detectorConfig);
}

// Initialize default
initCanvas();
initMediaPipe();

// --- Helpers for Coordinate Transforms ---

function worldToScreen(wx, wy) {
    return {
        x: wx * view.scale + view.x,
        y: wy * view.scale + view.y
    };
}

function screenToWorld(sx, sy) {
    return {
        x: (sx - view.x) / view.scale,
        y: (sy - view.y) / view.scale
    };
}

function fitImageToCanvas() {
    if (!currentImage) return;
    const canvasRatio = canvas.width / canvas.height;
    const imgRatio = currentImage.width / currentImage.height;

    if (imgRatio > canvasRatio) {
        view.scale = canvas.width / currentImage.width;
    } else {
        view.scale = canvas.height / currentImage.height;
    }
    
    // Center
    view.x = (canvas.width - currentImage.width * view.scale) / 2;
    view.y = (canvas.height - currentImage.height * view.scale) / 2;
}

// --- Event Listeners ---

modelSelect.addEventListener('change', async (e) => {
    currentModel = e.target.value;
    
    loadingDiv.classList.remove('hidden');
    try {
        if (currentModel === 'mediapipe') await initMediaPipe();
        else if (currentModel === 'movenet') await initMoveNet();
    } catch (err) {
        console.error("Error initializing model:", err);
        alert("Error initializing model: " + err.message);
    }
    loadingDiv.classList.add('hidden');

    if (currentImage) {
        processImage(currentImage);
    }
});

imageUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    loadingDiv.classList.remove('hidden');
    
    const img = new Image();
    img.onload = async () => {
        currentImage = img;
        initCanvas(); // Ensure canvas is sized correctly
        fitImageToCanvas();
        draw();
        
        await processImage(img);
    };
    img.src = URL.createObjectURL(file);
});

resetViewBtn.addEventListener('click', () => {
    fitImageToCanvas();
    draw();
});

editModeCheckbox.addEventListener('change', (e) => {
    // Automatically disable Show Full Pose when entering Edit Mode
    // to prevent ghosting of original raw landmarks.
    if (e.target.checked && showFullPoseCheckbox.checked) {
        showFullPoseCheckbox.checked = false;
        draw();
    }
});

// --- Zoom & Pan Interactions ---

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    const zoomSensitivity = 0.1;
    const delta = -Math.sign(e.deltaY) * zoomSensitivity;
    const newScale = view.scale * (1 + delta);
    
    // Limit zoom
    if (newScale < 0.1 || newScale > 10) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Zoom towards mouse pointer:
    // (mouseX - view.x) / view.scale = (mouseX - newViewX) / newScale
    view.x = mouseX - (mouseX - view.x) * (newScale / view.scale);
    view.y = mouseY - (mouseY - view.y) * (newScale / view.scale);
    view.scale = newScale;

    draw();
});

canvas.addEventListener('mousedown', (e) => {
    if (!currentImage) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Check for landmark hit first (if edit mode)
    if (editModeCheckbox.checked) {
        const worldPos = screenToWorld(mouseX, mouseY);
        // Find clicked point (radius increased to 25 for easier grabbing)
        
        for (let i = 0; i < landmarks.length; i++) {
            const p = landmarks[i];
            const screenP = worldToScreen(p.x, p.y);
            const dist = Math.sqrt(Math.pow(screenP.x - mouseX, 2) + Math.pow(screenP.y - mouseY, 2));
            
            if (dist < 25) { 
                isDragging = true;
                dragIndex = i;
                return; 
            }
        }
        // If we are in Edit Mode and didn't hit a landmark, DO NOTHING (do not pan)
        return;
    }

    // If not dragging landmark, then start pan
    isPanning = true;
    startPan = { x: mouseX - view.x, y: mouseY - view.y };
    canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isDragging) {
        const worldPos = screenToWorld(mouseX, mouseY);
        landmarks[dragIndex].x = worldPos.x;
        landmarks[dragIndex].y = worldPos.y;
        draw();
    } else if (isPanning) {
        view.x = mouseX - startPan.x;
        view.y = mouseY - startPan.y;
        draw();
    } else {
        // Hover effects
        if (editModeCheckbox.checked) {
             let hit = false;
             for (let i = 0; i < landmarks.length; i++) {
                const p = landmarks[i];
                const screenP = worldToScreen(p.x, p.y);
                const dist = Math.sqrt(Math.pow(screenP.x - mouseX, 2) + Math.pow(screenP.y - mouseY, 2));
                if (dist < 25) {
                    hit = true; 
                    break;
                }
             }
             canvas.style.cursor = hit ? 'pointer' : 'default';
        } else {
            canvas.style.cursor = 'grab';
        }
    }
});

canvas.addEventListener('mouseup', () => {
    isDragging = false;
    isPanning = false;
    dragIndex = -1;
    if (!editModeCheckbox.checked) canvas.style.cursor = 'grab';
    else canvas.style.cursor = 'default';
});

canvas.addEventListener('mouseleave', () => {
    isDragging = false;
    isPanning = false;
    dragIndex = -1;
});

// --- Export Functions ---

function downloadImage(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

exportCombinedBtn.addEventListener('click', () => {
    if (!currentImage) return;
    
    // Create a temporary canvas to render the full resolution output
    // We want to export the image as is, with overlays on top.
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = currentImage.width;
    exportCanvas.height = currentImage.height;
    const eCtx = exportCanvas.getContext('2d');
    
    // Draw Image
    eCtx.drawImage(currentImage, 0, 0);
    
    // Draw Overlays (Scale = 1, Translate = 0)
    // We need a helper to draw on a specific context with specific scale
    drawExport(eCtx, 1);
    
    downloadImage(exportCanvas.toDataURL('image/jpeg', 0.9), 'skeletal-drawing-combined.jpg');
});

exportSkeletonBtn.addEventListener('click', () => {
    if (!currentImage) return;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = currentImage.width;
    exportCanvas.height = currentImage.height;
    const eCtx = exportCanvas.getContext('2d');
    
    // Handle background
    if (skeletonBgSelect.value === 'white') {
        eCtx.fillStyle = 'white';
        eCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    }
    
    // Draw Overlays
    drawExport(eCtx, 1);
    
    downloadImage(exportCanvas.toDataURL('image/png'), 'skeletal-drawing-skeleton.png');
});

function drawExport(ctx, scale) {
    // Reuses logic but for a specific context.
    // NOTE: This duplicates some drawing logic but avoids complex state management of the main canvas.
    
    // Checkboxes check
    const drawOverlays = () => {
        // Draw Full Pose if checked (and raw data exists)
        if (showFullPoseCheckbox.checked && rawPoseLandmarks && currentModel === 'mediapipe') {
            if (!rawPoseLandmarks || !window.POSE_CONNECTIONS) return;
            const pixelLandmarks = rawPoseLandmarks.map(p => ({
                x: p.x * currentImage.width,
                y: p.y * currentImage.height,
                visibility: p.visibility
            }));
            
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 2; // Fixed width for export
            
            window.POSE_CONNECTIONS.forEach(([i, j]) => {
                const p1 = pixelLandmarks[i];
                const p2 = pixelLandmarks[j];
                if ((p1.visibility && p1.visibility < 0.5) || (p2.visibility && p2.visibility < 0.5)) return;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            });
            
            ctx.fillStyle = '#FF0000';
            pixelLandmarks.forEach(p => {
                if (p.visibility && p.visibility < 0.5) return;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
                ctx.fill();
            });
        }
        
        // Draw Skeleton if checked
        if (showLandmarksCheckbox.checked) {
             const connections = [
                ["L Shoulder", "R Shoulder"], ["L Shoulder", "L Elbow"], ["R Shoulder", "R Elbow"],
                ["L Shoulder", "L Hip"], ["R Shoulder", "R Hip"], ["L Hip", "R Hip"],
                ["L Hip", "L Knee"], ["R Hip", "R Knee"], ["Sternum", "Rib Cage"]
            ];

            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 3; 

            connections.forEach(([p1Name, p2Name]) => {
                const p1 = landmarks.find(l => l.name === p1Name);
                const p2 = landmarks.find(l => l.name === p2Name);
                if (p1 && p2) {
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            });
            
            // Draw Points
            landmarks.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
                ctx.fillStyle = '#FF0000';
                ctx.fill();
                
                if (showLabelsCheckbox.checked) {
                    ctx.fillStyle = 'white';
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 2;
                    ctx.font = '16px Arial';
                    ctx.strokeText(p.name, p.x + 10, p.y);
                    ctx.fillText(p.name, p.x + 10, p.y);
                }
            });
        }
    };
    
    drawOverlays();
}

// --- Processing ---

async function processImage(img) {
    loadingDiv.classList.remove('hidden');
    try {
        if (currentModel === 'mediapipe') {
            await mediaPipePose.send({image: img});
        } else if (currentModel === 'movenet') {
            if (!moveNetDetector) await initMoveNet();
            const poses = await moveNetDetector.estimatePoses(img);
            onMoveNetResults(poses);
        }
    } catch (err) {
        console.error(err);
        loadingDiv.classList.add('hidden');
    }
}

// --- MediaPipe Handling ---

function onMediaPipeResults(results) {
    loadingDiv.classList.add('hidden');
    if (!results.poseLandmarks) {
        console.log("No landmarks found");
        return;
    }
    rawPoseLandmarks = results.poseLandmarks;
    
    // MediaPipe 0-1 normalized coordinates -> Convert to Image Space
    const getPoint = (index) => ({
        x: results.poseLandmarks[index].x * currentImage.width,
        y: results.poseLandmarks[index].y * currentImage.height
    });

    const keypoints = {
        l_shoulder: getPoint(11), r_shoulder: getPoint(12),
        l_elbow: getPoint(13), r_elbow: getPoint(14),
        l_hip: getPoint(23), r_hip: getPoint(24),
        l_knee: getPoint(25), r_knee: getPoint(26)
    };

    updateLandmarks(keypoints);
}

// --- MoveNet Handling ---

function onMoveNetResults(poses) {
    loadingDiv.classList.add('hidden');
    if (poses.length === 0) return;

    const keypoints = poses[0].keypoints;
    // MoveNet returns absolute coordinates based on input image size if direct input?
    // But tensor flow JS might return them relative to input tensor. 
    // The `estimatePoses` usually returns pixel coordinates if we pass an Image element.
    // Let's assume pixel coordinates for now.

    rawPoseLandmarks = keypoints.map(kp => ({
        x: kp.x / currentImage.width, 
        y: kp.y / currentImage.height, 
        visibility: kp.score
    })); // Normalize for MediaPipe drawer compatibility

    const getKP = (name) => {
        const kp = keypoints.find(k => k.name === name);
        return kp ? {x: kp.x, y: kp.y} : {x: 0, y: 0};
    };

    const kpMap = {
        l_shoulder: getKP('left_shoulder'), r_shoulder: getKP('right_shoulder'),
        l_elbow: getKP('left_elbow'), r_elbow: getKP('right_elbow'),
        l_hip: getKP('left_hip'), r_hip: getKP('right_hip'),
        l_knee: getKP('left_knee'), r_knee: getKP('right_knee')
    };

    updateLandmarks(kpMap);
}

// --- Common Logic ---

function updateLandmarks(kp) {
    // kp is map of {x, y} (Image Space)
    
    const get = (k) => kp[k];

    const leftShoulder = get('l_shoulder');
    const rightShoulder = get('r_shoulder');
    const leftElbow = get('l_elbow');
    const rightElbow = get('r_elbow');
    const leftHip = get('l_hip');
    const rightHip = get('r_hip');
    const leftKnee = get('l_knee');
    const rightKnee = get('r_knee');

    // Derived landmarks
    const sternum = {
        x: (leftShoulder.x + rightShoulder.x) / 2,
        y: (leftShoulder.y + rightShoulder.y) / 2
    };

    const midHip = {
        x: (leftHip.x + rightHip.x) / 2,
        y: (leftHip.y + rightHip.y) / 2
    };
    const ribCage = {
        x: (sternum.x + midHip.x) / 2,
        y: (sternum.y + midHip.y) / 2
    };

    const leftFemur = {
        x: (leftHip.x + leftKnee.x) / 2,
        y: (leftHip.y + leftKnee.y) / 2
    };
    const rightFemur = {
        x: (rightHip.x + rightKnee.x) / 2,
        y: (rightHip.y + rightKnee.y) / 2
    };

    const newLandmarks = [
        { name: "L Shoulder", ...leftShoulder },
        { name: "R Shoulder", ...rightShoulder },
        { name: "L Elbow", ...leftElbow },
        { name: "R Elbow", ...rightElbow },
        { name: "Sternum", ...sternum },
        { name: "Rib Cage", ...ribCage },
        { name: "L Hip", ...leftHip },
        { name: "R Hip", ...rightHip },
        { name: "L Knee", ...leftKnee },
        { name: "R Knee", ...rightKnee },
        { name: "L Femur", ...leftFemur },
        { name: "R Femur", ...rightFemur },
    ];

    landmarks = newLandmarks;
    originalLandmarks = JSON.parse(JSON.stringify(newLandmarks));
    draw();
}

function draw() {
    // Fill background
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!currentImage) return;

    ctx.save();
    // Apply Viewport Transform
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);

    // Draw Image
    ctx.drawImage(currentImage, 0, 0);

    // Checkboxes check
    const drawOverlays = () => {
        if (showFullPoseCheckbox.checked && rawPoseLandmarks && currentModel === 'mediapipe') {
            drawFullPose();
        }
        if (showLandmarksCheckbox.checked) {
            drawSkeleton();
            drawPoints();
        }
    };
    
    drawOverlays();

    ctx.restore();
}

function drawFullPose() {
    if (!rawPoseLandmarks || !window.POSE_CONNECTIONS) return;
    
    // Convert normalized landmarks to Image Space pixel coordinates
    const pixelLandmarks = rawPoseLandmarks.map(p => ({
        x: p.x * currentImage.width,
        y: p.y * currentImage.height,
        visibility: p.visibility
    }));

    // Draw Connections manually to avoid MediaPipe utility scaling issues with custom viewport
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2 / view.scale; // Scale line width to remain constant on screen
    
    window.POSE_CONNECTIONS.forEach(([i, j]) => {
        const p1 = pixelLandmarks[i];
        const p2 = pixelLandmarks[j];
        
        // Check visibility if available
        if ((p1.visibility && p1.visibility < 0.5) || (p2.visibility && p2.visibility < 0.5)) return;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    });

    // Draw Landmarks
    ctx.fillStyle = '#FF0000';
    const radius = 3 / view.scale;
    
    pixelLandmarks.forEach(p => {
        if (p.visibility && p.visibility < 0.5) return;
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI);
        ctx.fill();
    });
}

function drawSkeleton() {
    // Define connections
    const connections = [
        ["L Shoulder", "R Shoulder"],
        ["L Shoulder", "L Elbow"],
        ["R Shoulder", "R Elbow"],
        ["L Shoulder", "L Hip"], 
        ["R Shoulder", "R Hip"],
        ["L Hip", "R Hip"],
        ["L Hip", "L Knee"], 
        ["R Hip", "R Knee"], 
        ["Sternum", "Rib Cage"] 
    ];

    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 3 / view.scale; // constant width on screen? or scale with image?
    // If we want lines to stay same thickness visually on screen: width / scale
    // If we want lines to scale with image: constant width. 
    // Usually user wants to see thin lines when zoomed in? Let's keep it constant "Image space" width (scales with zoom) for now, or constant screen width?
    // Let's try constant screen width: 3 / view.scale.
    ctx.lineWidth = 3 / view.scale;

    connections.forEach(([p1Name, p2Name]) => {
        const p1 = landmarks.find(l => l.name === p1Name);
        const p2 = landmarks.find(l => l.name === p2Name);
        
        if (p1 && p2) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
    });
}

function drawPoints() {
    landmarks.forEach(p => {
        ctx.beginPath();
        // radius 6 screen pixels?
        ctx.arc(p.x, p.y, 6 / view.scale, 0, 2 * Math.PI);
        ctx.fillStyle = '#FF0000';
        ctx.fill();
        
        if (showLabelsCheckbox.checked) {
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2 / view.scale;
            ctx.font = `${16 / view.scale}px Arial`; // Scale font so it stays readable
            ctx.strokeText(p.name, p.x + 10/view.scale, p.y);
            ctx.fillText(p.name, p.x + 10/view.scale, p.y);
        }
    });
}

// Event Listeners for controls
showLandmarksCheckbox.addEventListener('change', draw);
showLabelsCheckbox.addEventListener('change', draw);
showFullPoseCheckbox.addEventListener('change', draw);
resetBtn.addEventListener('click', () => {
    if (originalLandmarks.length > 0) {
        landmarks = JSON.parse(JSON.stringify(originalLandmarks));
        draw();
    }
});
