const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use('/audios', express.static(path.join(__dirname, 'AUDIOS')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/playlist', (req, res) => {
  const audioDir = path.join(__dirname, 'AUDIOS');
  fs.readdir(audioDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read audio directory' });
    }
    const audioFiles = files
      .filter(f => f.endsWith('.mp3'))
      .map(f => ({
        filename: f,
        url: `/audios/${encodeURIComponent(f)}`
      }));
    res.json(audioFiles);
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
