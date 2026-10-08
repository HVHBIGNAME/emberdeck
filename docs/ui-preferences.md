# Personal preferences

Open **Settings** in the sidebar or use the sliders button in the top bar. The sign-in screen also has a settings link. These controls work in the read-only demo.

## Appearance

| Setting        | Choices                        | Default                                                   |
| -------------- | ------------------------------ | --------------------------------------------------------- |
| Theme          | Light, dark, system            | System                                                    |
| Accent         | Ember, moss, diamond, amethyst | Ember                                                     |
| Interface size | Compact, comfortable, large    | Comfortable                                               |
| Language       | English, Russian               | Russian for a Russian-language browser; otherwise English |

Layouts use the available viewport width. At 2560px, the server grid shows four columns; narrow displays rearrange controls and cards. Interface size adjusts the shared `rem` scale. Browser zoom remains available.

Manrope headings and Golos Text body text include Cyrillic and are served from the panel itself. The overview puts the server fleet before the activity chart. Each server card opens across its entire surface; its copy-address button and action menu work independently. Blueprint cards also open from their artwork or description.

[Font licenses](../web/public/font-licenses.txt) are bundled with the interface and available at `/font-licenses.txt` on a native panel.

Interface text, dates, number formatting, built-in blueprint descriptions and diagnostic guidance are localized. Server names, console output, file contents and third-party package descriptions retain their original content.

## Motion and input

**Animations** controls page transitions, card reveals, changing counters, background motion, sliding filter highlights and CSS micro-interactions. Resource and background-intensity sliders animate their fill and thumb while supporting dragging, arrows and Home/End. A system `prefers-reduced-motion` setting takes precedence without erasing your saved choice. Background animation pauses when the tab is hidden.

**Smooth startup** keeps the opening screen visible for at least **0.9 seconds** on a fresh visit or reload, followed by a short fade. It is enabled by default and can be turned off independently under **Settings → Motion & interaction**. Data loads in parallel. Slower connections keep the screen visible until startup settles; connection errors appear immediately. This extra pause does not repeat for in-app navigation or background refreshes. Turning off Animations or requesting reduced motion also bypasses the artificial wait without changing the saved Smooth startup preference.

**Focus cursor** draws an outline around the element under a mouse or trackpad pointer, following its individual corner radii. It frames entire cards, choice tiles and slider fields, including during a drag; selector options are framed inside their open menu. Text inputs retain their native text cursor. Touch devices and reduced-motion mode use native input. Disabling animations makes the outline follow without a spring transition; disabling Focus cursor removes it entirely.

Selectors support arrows, Home/End, type-ahead, Enter and Escape. Escape closes an open selector before its parent dialog. Dialogs and mobile navigation return focus to their trigger when closed.

## Backgrounds

- **Quiet canvas:** plain background.
- **Golden hour:** a forest lake at sunset.
- **Overworld:** a mountain panorama.
- **Nether:** a warm-lit Nether landscape.
- **The End:** an End landscape.
- **Your image:** a local PNG, JPEG or WebP file.

Intensity ranges from 0 to 80%. Custom images may be up to 8 MiB. The browser resizes them to fit 2560 × 1600, encodes a WebP preview, and stores it locally; the panel receives no image upload. SVG is not accepted. A storage or decoding failure is shown beside the control. **Remove image** deletes the saved image.

The built-in scenes are in-game screenshots packaged as local WebP assets, with a slow pan and crossfade when motion is enabled. Cards use smaller crops. These covers are illustrative; they do not depict your running worlds. [Artwork sources and credits](../web/public/scenes/SOURCES.md). Existing saved `aurora` preferences select Golden hour.

## Persistence and reset

Preferences use `emberdeck.preferences.v1` and the image uses `emberdeck.background.v1` in local storage. Changes synchronize between tabs on the same origin. Another browser or panel address has its own settings, including a changed temporary tunnel hostname.

**Reset appearance** restores the default appearance and motion settings while keeping your language. An uploaded image remains available until explicitly removed. If storage is blocked, appearance changes still work in the current tab and the UI reports that they could not be saved. Invalid stored settings recover to defaults with an explanation.

## Installation help

The overview is the default landing page. To deploy on another machine, use **Settings → Help & deployment → Open installation guide**. Direct `#/install` links and the pre-sign-in installation entry remain available.
