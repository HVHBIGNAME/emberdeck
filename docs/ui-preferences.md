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

Interface text, dates, number formatting, built-in blueprint descriptions and diagnostic guidance are localized. Server names, console output, file contents and third-party package descriptions retain their original content.

## Motion and input

**Animations** controls page transitions, card reveals, changing counters, background motion and CSS micro-interactions. A system `prefers-reduced-motion` setting takes precedence without erasing your saved choice. Background animation pauses when the tab is hidden.

**Focus cursor** draws an outline around the element under a mouse or trackpad pointer. Text inputs retain their native text cursor. Touch devices and reduced-motion mode use native input. Disabling animations makes the outline follow without a spring transition; disabling Focus cursor removes it entirely.

Selectors support arrows, Home/End, type-ahead, Enter and Escape. Escape closes an open selector before its parent dialog. Dialogs and mobile navigation return focus to their trigger when closed.

## Backgrounds

- **Quiet canvas:** plain background.
- **Aurora:** drifting soft light.
- **Overworld:** pixel hills and clouds.
- **Nether:** warm colors and rising embers.
- **The End:** floating islands and stars.
- **Your image:** a local PNG, JPEG or WebP file.

Intensity ranges from 0 to 80%. Custom images may be up to 8 MiB. The browser resizes them to fit 2560 × 1600, encodes a WebP preview, and stores it locally; the panel receives no image upload. SVG is not accepted. A storage or decoding failure is shown beside the control. **Remove image** deletes the saved image.

## Persistence and reset

Preferences use `emberdeck.preferences.v1` and the image uses `emberdeck.background.v1` in local storage. Changes synchronize between tabs on the same origin. Another browser or panel address has its own settings, including a changed temporary tunnel hostname.

**Reset appearance** restores the default appearance and motion settings while keeping your language. An uploaded image remains available until explicitly removed. If storage is blocked, appearance changes still work in the current tab and the UI reports that they could not be saved. Invalid stored settings recover to defaults with an explanation.

## Installation help

The overview is the default landing page. To deploy on another machine, use **Settings → Help & deployment → Open installation guide**. Direct `#/install` links and the pre-sign-in installation entry remain available.
