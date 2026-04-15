# SAD ABDUCTION

> *"They never wanted to leave."*

A melancholy browser-based arcade game where you pilot an alien spacecraft, abduct unsuspecting inhabitants from various planets, and deal with the existential weight of your actions — one sad fact at a time.

<!-- Screenshots: add images to a screenshots/ folder and uncomment
![Start Screen](screenshots/start-screen.png)
![Gameplay](screenshots/gameplay.png)
-->

## How to Play

Open `index.html` in any modern browser. No build step, no dependencies — just pure HTML5 Canvas.

### Controls

#### Keyboard

| Key | Action |
|---|---|
| WASD / Arrow Keys | Fly the ship |
| Space | Tractor beam (abduct specimens) |
| Shift | Boost |
| Q | Fire missile |
| F | Flamethrower |
| E | Repulsor blast |
| X | Exit/enter ship (walk around on foot) |
| 1 / 2 / 3 | Purchase upgrades (10 pts each) |

#### Mobile

Touch controls are available with a virtual joystick (left side) and action buttons (right side). A fullscreen button appears in the top-right corner.

### Gameplay Loop

1. **Fly to a planet** — navigate through space and descend onto one of five unique worlds
2. **Abduct specimens** — hover over inhabitants and activate the tractor beam
3. **Cause chaos** — destroy buildings, fight military resistance, spread terror
4. **Return to the Mothership** — fly back to space and dock to secure your specimens
5. **Talk to crew** — interact with NPCs aboard the Mothership (Commander Zyx, Dr. Quilb, Pilot Vrek, Engineer Blip)
6. **Complete missions** — accept objectives from the Commander for bonus progression
7. **Upgrade your ship** — spend collected specimens on beam width, engine speed, or flamethrower power

### Upgrades

| Key | Upgrade | Effect |
|---|---|---|
| 1 | Beam Width | Wider tractor beam for easier abductions |
| 2 | Engine Speed | Faster ship movement |
| 3 | Flamethrower | More powerful flames |

Each upgrade costs **10 specimens**.

## Planets

| Planet | Description |
|---|---|
| **Earth** | The classic. Suburbia, commuters, and a dog that will wait by the door forever. |
| **Mars Colony** | Humanity's last hope. They spent 7 months getting here. Ironic. |
| **Glimora** | A peaceful purple world of song weavers and crystal elders. Was peaceful. |
| **Frostheim** | Frozen tundra inhabited by snow yetis and frost shamans. |
| **Infernia** | A volcanic hellscape of lava brutes and fire temples. |

Each planet features unique inhabitants, architecture, weather, color palettes, and sad facts.

## Features

- **On-foot mode** — exit your ship and walk around as the alien, shooting creatures directly
- **Military resistance** — wanted level system (0-5 stars) with soldiers, vehicles, and turrets
- **Day/night cycle** — dynamic lighting that changes over time
- **Weather systems** — clouds, environmental hazards
- **Combo system** — chain abductions for bonus points
- **Mothership interior** — walk around, talk to crew NPCs, accept missions
- **Mission system** — abduct targets, destroy buildings, survive on foot, reach terror levels
- **Sad facts** — every abduction reminds you of what you've taken
- **Mobile support** — fully playable on phones and tablets with touch controls

## Tech Stack

- Vanilla JavaScript (no frameworks)
- HTML5 Canvas API
- CSS for UI overlay
- Single-file architecture (`index.html`)

## Running Locally

```bash
# Any static file server works, or just open the file directly:
open index.html

# Or with Python:
python3 -m http.server 8000
```

## License

All rights reserved.
