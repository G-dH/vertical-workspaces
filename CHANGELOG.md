## Changelog:
### v19
**Added:**
- Overview modes `Expose Windows on Hover` and `Static Workspace`
- Option `Always Show Window Titles`
- Option `Dash Background Radius`
- Option `Animation Speed`

**Fixed:**
- Startup animation can still freeze Shell in certain configuration. Injection replaced by complete override of the *startupAnimation()* function.
- Workaround for upstream bug - stuttering first animation of App Grid with many icons

**Other changes:**
- Preferences split into more sections for better readability.

### v17, v18 (2022-12-07)
**Added:**
- Separate scales for blur amount in overview window picker and app grid/search results.
- Option `Smooth Blur Transitions` allows to disable smooth blur transitions on slower hw.

**Fixed:**
- Startup animation can freeze Shell if `Show Workspace Preview Background` option disabled.
- Secondary workspace thumbnails not visible in overview after starting GS.
- Dash, WS thumbnails and Search entry animations exceptions.
- App grid animates over the Dash instead below it.

**Other changes:**
- Default Dash background opacity set to 40.
- Workspace thumbnail caption style.

### v16 (2022-12-05)
**Fixed:**
- Dash to Dock compatibility.
- Improved static background transitions.

### v15 (2022-12-01)
**Fixed:**
- Dash / ws thumbnails shifted after disable, if ws preview background is disabled.
- Delayed dash / ws thumbnails animation after screen unlocks.

### v14 (2022-11-29 e.g.o only)
**Added:**
- Option `Show Static Background` allows keep background wallpaper in the Activities overview.
- Slider `Blur Static Background` allows add blur to the static background image.
- Search result style - added bit of transparency to look better with static background.
- Link to changelog on About page.

**Fixed:**
- Option `Override Page Up/Down Shortcuts` doesn't work reliably.

**Other changes:**
- Next/Prev page indicators in GS43 are hard to switch from horizontal orientation to vertical, so for now I added style that makes them look more like vertical arrows indicating direction to the prev/next page.

### v13 (2022-10-20)
**Added:**
- Horizontal 3 finger gesture automatically changes its direction depending on the workspace thumbnails position to match direction of the transition animation.
- Vertically oriented Dash items can be selected and activated even with the pointer at the edge of the screen.
- Option `Startup State` allows to change GNOME Shell's startup state from Overview to Desktop.
- Option `Always Show Search Entry` now allows showing the search entry even if the search is not active.

**Fixed**
- 3 finger gestures not having proper orientation when used for the first time after enabling the extension.
- Dash overlapping workspace during transition between normal view and overview when using a 3 finger gesture.
- Dash icons can get out of border when dash size reach its maximum.
- Smaller workspace preview size if DtD set to auto-hide.
- Dash startup animation doesn't respect Dash position, workspace thumbnails don't animate at all.

### v12 2022-09-04
**Fixed:**
- Dash to Dock compatibility issue when original Dash set to vertical position

### v11 2022-09-04
**Added**
- Window preview app icon size
- About page
- Reset button that allows to set all options to their default values
- GNOME Shell 43 support
- Automatic `Fix for Dash to Dock` option activation when DtD detected during enabling

**Fixed**
- App Grid page indicator not vertical
- Workspace thumbnail caption can show window title from different workspace (typically VBox Machine)

### v10 2022-08-03
**Added:**
- Option `Show Workspace Preview Background` allows to hide background wallpaper in the overview.

**Fixed:**
- Broken overview after *Dash to Dock* disabled.

**Other changes:**
- Preferences reorganized

### v9 2022-07-31
**Added:**
- Option `Show Workspace Labels` allows to show label on each workspace thumbnail. Options: `Index`, `Index + Workspace Name`, `Index + App Name`
- Option `Show Workspace Label on Hover` hides the labels until mouse hovers over a thumbnail.
- Option to hide Workspace Thumbnails on primary and secondary monitors individually in their position option list.
- Independent position adjustment for secondary monitors workspace thumbnails.
- Vertical workspace switcher popup.
- Settings page `Content` has been removed and `Disable` options were added to the position option list of the `Dash` and `Workspace Thumbnails`.

### v8 22-07-27
**Added:**
- **Vertical Dash** which can be placed at the left and right side of the screen, in addition to top and bottom positions.
- `Fine Tune Position` sliders for Dash and window switcher.
- `Dash Height Max Scale` option has been replaced by `Dash Max Icon Size` option which allows more precise setting.

### v7 22-07-23
**Fixed:**
- Fix of `Fix for Dash to Dock`

### v6 22-07-23
**Added:**
- Option `Auto` to App Grid Animation menu, changes animation direction according to workspace switcher position and visibility.
- Option `Fix for Dash to Dock` helps to keep VW consistent when DtD updates its position and while updating monitors configuration.

**Fixed:**
- Dash position can be off a little bit with `Center Dash to WS` option.
- Secondary monitor overview transitions

### v5 2022-07-20
**Added:**
- `Content` page in Preferences window with options to hide Dash, workspace switcher and wallpaper in workspace thumbnails.
- New transition animations between Window Picker, App Grid and Desktop views.
- Workspace and App Grid animation options.
- Option to automatically switch `(Shift +) Super + Page Up/Down` keyboard shortcuts for the current workspace orientation.
- Option to expand workspace thumbnails to entire height of the work area at the expense of Dash width.

