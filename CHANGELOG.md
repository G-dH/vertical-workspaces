## Changelog:
### v31 (not released yet)
**Fixed**
- Compatibility with Dash to Dock extension - hidden dock in the overview, broken layout after startup
- Compatibility with Hide Top Bar extension
- App search provider ignores non-localized app names
- App folders grid dimensions wrong if set to *Adaptive* and folder icon is set to a fixed size


### v30 (2023-06-09)
**Added:**
- Dash option - Click Behavior: *Prefer Current Workspace* - opens a new window if app not present on the active workspace
- Window search provider sorting options
- Esc key behavior options
- Window preview - middle and secondary mouse button behavior options, close button can be hidden
- GNOME 3 vertical dash style is now optional
- Window preview title position option
- Light dash background option
- Remove app folder button in folder dialog
- *Updating V-Shell* banner appears during updating V-Shell settings when settings window is irresponsive
- Dutch translation by @Vistaus

**Fixed:**
- Dash icon scroll action conflicts with Dash to Dock
- Open new window by middle click on app icon or Ctrl+Enter doesn't work
- Dash icon label can extend to the adjacent display
- WindowPreview module not updated when "always-activate-selected-window" changed
- App folder dialog position if secondary monitor connected
- App folder dialog sizing and positioning
- Background brightness in search view reduced independently to avoid unreadable text and consistent style
- Compatibility with Burn My Windows - freeze after screen unlocked, or extensions re-enabled
- Window and Recent files search providers modes not isolated well from results of other providers
- Recent file search provider results sorting
- App grid icons with multi-line label move on hover when label expands
- Search view animation skipped id triggered from app grid state
- DING desktop icons not visible during static background workspace animation


**Other changes:**
- Added `unlock-dialog` session mode to avoid unnecessary system load when using screen lock
- App Grid refactored, added transparent app folder dialogs on clean background
- Search view transparency and fixed background brightness in classic overview
- Search view in static workspace overview with full opacity and close to default style
- Settings window - Profiles tab moved at first position, Dash icons position options moved back to layout
- Updated default profiles


### v29 (2023-04-11)
**Fixed:**
- Window switcher/highlighter logic when scrolling over an dash icon
- Unhandled promise rejection warnings on GS 43+


### v28 (2023-04-06)
**Added:**
- App Grid - vertical app folder orientation
- App Grid - *App Grid Page Width Scale* and *Grid Spacing* options
- Dash - *Click Behavior* option *Open New Window (if supported)* - switches primary and middle mouse buttons action
- Improved support for scaled display and icon sizing

**Fixed:**
- Missing default profile names
- App Grid - *Allow Incomplete Pages* option has no effect
- App Grid - adaptive folder grid size can exceed display/dialog size
- App Grid - unnecessary side spacing when dash and workspace thumbnails are horizontal
- Workspace switcher popup when switching workspaces using gestures

**Other changes:**
- Default profiles values
- Settings window - Profile buttons order


### v27 (2023-03-24)
**Added:**
- Predefined customizable profiles for quick configuration changes. The predefined profiles can set the V-Shell to behave like GNOME Shell 3.xx or 40+, make work with the default hot corner more efficient, or make overview behave more like a dock.
- Super key double-press behavior options
- Brightness setting for background wallpaper in the overview
- Hot corner position and hot edge options
- Window preview option *Always Activate Selected* allows to switch windows using the overview without clicking
- Scrolling over the app icon in the dash can switch between application window previews
- OSD position options
- Customizable workspace preview corner radius

**Changed:**
- Default max result rows changed from 10 to 5
- Max result rows for recent file search provider set to fixed 20 (these results are not included in the standard search)

**Fixed:**
- Dash style affects Dash to Dock / Ubuntu Dock background
- GS44 app grid folders - DND with pinned/favorite/running apps can crash the Shell
- Compatibility with Dash to Panel and Hide Top Bar extensions
- Compatibility with Desktop Cube extension (in horizontal mode)
- Dash icon click behavior options moved from appDisplay to dash module
- Bg blur transition to the search view


### v26 (2023-03-08)
**Added:**
- V-Shell modules control - allows disabling expendable modules if they are in conflict with preferred other extensions, or misbehave.
- Hot corner options

**Fixed:**
- App grid's adaptive grid size algorithm doesn't support screen scaling.
- App grid label option *Always Expanded* doesn't expand labels until the icon is hovered by the pointer.
- Scroll over panel that is in the *Overview Only* mode switches workspace.
- Leaving the overview using gesture if any window is selected fills the system log with errors - upstream bug.
- Panel style transitions in other than default modes.
- Overview keyboard navigation.


### v24/25 (2023-03-03)
**Added:**
- Support for GNOME Shell 44.
- Support for horizontally stacked workspaces, the orientation follows `Workspaces Thumbnails Position` option.
- `Dash Max Icon Size` menu now offers 80, 96, 112 and 128 px options.
- Dash can use available space better if resizes its icons when there is not enough space on the screen for the chosen icon size.
- Options `Dash Icon Click`: `Activate Last Used Window Immediately` (default behavior) and `Switch to Workspace with Recently Used Window` which allows you to see an overview of the workspace with the app window before activating it and closing the overview.
- Options `Workspaces Scale` and `Workspaces Spacing` adjustments for workspace preview.
- Option `Workspace Switcher Animation` / `Static Background` for static background while switching workspaces outside of the overview.
- Options `Main Panel Position` and `Main Panel Visibility` allows moving the main panel at the bottom of the screen, hide it, or only show it in the Activities overview.
- Options `App Search Icon Size` with reduced spacing between icons and `Search Results Width`.
- Option `Max Search Results Rows` allows to set maximum number of rows for all search providers (except for the app search provider that uses grid instead of the list).
- Optional Search view transition animation.
- Optional `Window Search Provider` directly accessible via an optional icon in the dash, by pressing the Space key in the overview, or by secondary mouse button click on the 'Show Apps' dash icon.
- Secondary mouse button click on a window preview opens window search provider searching for the window app name.
- Optional `Recent Files Search Provider` directly accessible via an optional icon in the dash or by pressing the Ctr+Space key in the overview.
- Text shadow in labels of app grid view icons for better visibility on lighter backgrounds, in case you use `Show Static Background` option for the overview.
- Open preferences by middle click on *Show Applications button* in the dash (default dash only).
- Option to show current window title in the workspace thumbnail label.
- `Close Workspace Button` option can add close button to workspace thumbnails that allows you to close all windows on the workspace/monitor. You can choose whether it close on single click, double-click or single click while holding down the Ctrl key.
- App Grid options - `Icon Size`, `Columns/Rows per Page`, `Apps Order` - `Custom`, `Alphabet`, `Usage`, option to `Include Dash Items`, `Reset App Grid Layout`, `Remove App Grid Folders`.
- App Grid's *Include Dash Items* option changed to `App Grid Content` and allows exclude favorites and/or running apps from the grid also in the default custom layout mode.
- Option `App Labels Behavior` offers setting App Grid app labels to show always expanded or hide them if the app icon is not selected.
- Option `Active Icons in Preview Folders` allows you using icons in the folder preview as normal app icons without opening the folder.
- App folder preview icons can be displayed in 3x3 grid instead of 2x2 and icon/folder size can be set up to 256px to allow bigger Active folder icons.
- Improved app search, now you can find *Firefox* even if you enter *fox* and with the (pseudo) fuzzy search enabled, you'll find it even if you enter *ffx*.
- Notification banners position option.
- `Window Attention Handler` options - `Disable Notifications`, `Immediately Focus Window`.
- New options for secondary monitor overview allow independent workspace thumbnails and workspace preview scales and also can move the ws preview as if there was the main panel, like on the primary monitor.
- Custom workspace switcher popup position and visibility.

**Fixed:**
- Some options related to the workspace preview don't work for secondary monitors if workspaces set to "primary monitor only".
- Optimized blur effect transitions.
- Smaller single windows not properly scaling with workspace preview in `Expose Windows on Hover` mode.
- (upstream bug) Closing windows in the overview fills log with "access to destroyed" object errors.
- (upstream bug) Glitching transition when minimizing full-screen window.
- Workspace thumbnails size breathing during adding/removing workspaces

**Changed:**
- Extension renamed to V-Shell, because the vertical workspace orientation is not the only option any more and the 'V' might stand for *Vertical*, but also for *Variable*.

### v23 (v19, v20, v21, v22) (2022-12-22)
**Added:**
- Overview modes `Expose Windows on Hover` and `Static Workspace`
- Option `Always Show Window Titles`
- Option `Dash Background Radius`
- Option `Animation Speed`

**Fixed:**
- Startup animation can still freeze Shell in certain configuration. Injection replaced by complete override of the *startupAnimation()* function.
- Workaround for upstream bug - stuttering first animation of App Grid with many icons.

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

