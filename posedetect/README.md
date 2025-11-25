# Skeletal Drawing Tool

This tool allows users to upload an image and automatically map skeletal landmarks using MediaPipe Pose.

## Features
- **Landmark Detection**: Automatically detects Shoulders, Elbows, Hips, Knees.
- **Derived Landmarks**: Approximates Sternum, Rib Cage, and Femur.
- **Visualization**: Draws a skeletal overlay and labeled points.
- **Editing**: Enable "Edit Mode" to drag and adjust landmarks manually.
- **Navigation**: Zoom in/out using the mouse wheel, and click-drag to pan the image.
- **Controls**: Toggle visibility of landmarks and labels.

## How to Use
1. Open `index.html` in a web browser.
   - **Note**: For best performance and to avoid CORS issues, it is recommended to serve the files using a local web server (e.g., `python3 -m http.server`, `npx serve`, or VS Code Live Server).
2. Click "Choose File" to upload an image (e.g., a photo of a person).
3. Wait for the processing to complete.
4. Use the checkboxes to toggle views.
5. Use the mouse wheel to zoom and drag to pan around the image.
6. Check "Edit Mode" to adjust point positions.

## Landmarks
The tool maps the following points:
- Shoulders (L/R)
- Elbows (L/R)
- Hips (L/R)
- Knees (L/R)
- Sternum (calculated)
- Rib Cage (calculated)
- Femur (calculated midpoint)
