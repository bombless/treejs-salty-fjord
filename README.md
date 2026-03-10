# Salty Fjord (Three.js)

A lightweight Three.js scene that renders a stylized salty fjord environment:

- Procedural fjord terrain with steep mountain walls
- Animated seawater shader with foam overlay
- Floating mist particles and atmospheric fog
- Orbit camera controls

## Run

Use any static server from this folder, for example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Files

- `index.html`: entry page
- `main.js`: scene setup, terrain generation, shaders, animation loop
- `vendor/`: local Three.js dependencies (no external CDN required at runtime)
