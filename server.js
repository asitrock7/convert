const express = require('express');
const multer = require('multer');
const { fromPath } = require('pdf2pic');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');

// Tell fluent-ffmpeg to use the standalone binary we installed via npm
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = process.env.PORT || 3000;

// Setup Multer for handling uploads
const upload = multer({ dest: 'uploads/' });

// Serve the frontend
app.use(express.static('public'));

app.post('/convert', upload.single('pdf'), async (req, res) => {
    if (!req.file) return res.status(400).send('No PDF uploaded.');

    const pdfPath = req.file.path;
    const sessionId = req.file.filename;
    const outputDir = path.join(__dirname, 'output', sessionId);
    
    // Create a temporary directory for this specific conversion
    fs.mkdirSync(outputDir, { recursive: true });

    // PDF to Image Options
    const options = {
        density: 150, 
        saveFilename: "slide",
        savePath: outputDir,
        format: "png",
        width: 1280,
        height: 720
    };

    try {
        const storeAsImage = fromPath(pdfPath, options);
        // Pass -1 to convert all pages in the PDF
        await storeAsImage.bulk(-1); 

        const videoPath = path.join(outputDir, 'final_video.mp4');
        // pdf2pic outputs files like slide.1.png, slide.2.png
        const imagePattern = path.join(outputDir, 'slide.%d.png'); 

        // Stitch images into video
        ffmpeg()
            .input(imagePattern)
            .inputFPS(1) // 1 Frame Per Second (Each page shows for 1 second)
            .output(videoPath)
            .videoCodec('libx264')
            .outputOptions([
                '-pix_fmt yuv420p', // Ensures compatibility across most media players
                '-vf scale=1280:720' // Forces 720p resolution
            ])
            .on('end', () => {
                // Send the video to the client
                res.download(videoPath, 'converted_video.mp4', (err) => {
                    // Cleanup files after download to save server space
                    fs.rmSync(pdfPath, { force: true });
                    fs.rmSync(outputDir, { recursive: true, force: true });
                });
            })
            .on('error', (err) => {
                console.error(err);
                res.status(500).send('Error compiling video.');
                // Cleanup on error
                fs.rmSync(pdfPath, { force: true });
                fs.rmSync(outputDir, { recursive: true, force: true });
            })
            .run();

    } catch (err) {
        console.error(err);
        res.status(500).send('Error reading PDF pages. Ensure Ghostscript is installed on the server.');
        fs.rmSync(pdfPath, { force: true });
        fs.rmSync(outputDir, { recursive: true, force: true });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
