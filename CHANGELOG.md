## Changelog:
### v49.6 (not yet released)
**Fixed**
- Dragging an app icon while the app search filter was active could break the app grid
- The app grid's _Allow Incomplete Pages_ option broke the sorting of search results
- The _Settings_ app icon was not focused as the first result in the filtered app grid
- App grid page indicators appeared even when drag and drop within the app grid was not allowed
- The app grid could remain on a non-first page when the app search filter was initiated or updated
- The workspace thumbnail scale transition between search results and the app grid


### v49.5 (2025-10-24)
**Fixed**
- Performance of workspace thumbnails transitions
- Clipping of workspace on primary monitor if Workspace Preview Animation is disabled
- Dash icon *Scroll Action* → *Cycle App Windows* could fail on multi-monitor systems
- The initial selection of the focused window did not work for modal windows ([#268](https://github.com/G-dH/vertical-workspaces/issues/268))
- Three-finger horizontal gestures in GNOME 49 for vertical workspace orientation
- Unexpected spacing between top panel and vertically oriented *Dash to Dock* ([#269](https://github.com/G-dH/vertical-workspaces/issues/269))
- The App Grid occasionally remained empty after updating the appDisplay content
- The *Click Empty Space to Close* didn't work on secondary monitors 

**Added**
- Vanilla fade-out effect for workspace thumbnails when transitioning to the app grid with *Workspace Preview Animation* set to *All Workspaces*
- Search: *--* prefix to restrict overview search to GNOME Settings panels
- Profile 5 with configuration as close to vanilla GNOME as currently possible
- Slight blur effect to workspace thumbnails if they’re transparent and the blur makes sense ([#270](https://github.com/G-dH/vertical-workspaces/issues/270))

**Other Changes**
- Updated predefined configuration profiles
- Increased the corner radius of the search results background for the *Dark* style


### v49.4 (2025-10-12)
**Fixed**
- Overview transitions when search was triggered before the overview show animation finished
- Search results' scroll bar style
- Window title could appear under the dash if set to *Below Window*


### v49.3 (2025-10-10)
**Fixed**
- Secondary monitors workspace clipping when App Grid is open ([#247](https://github.com/G-dH/vertical-workspaces/issues/247))
- Running dot 1px off with custom dash background ([#262](https://github.com/G-dH/vertical-workspaces/issues/262))
- Glitching of workspace tumbnails on secondary monitors when using 3 finger gestures

**Other Changes**
- `Super + Tab` in the Activities overview no longer skips the last empty workspace 


### v49.2 (2025-10-04)
**Fixed**
* The *Click Empty Space to Close* overview option on GNOME 49 caused any click in the overview to close it, making its elements unusable ([#264](https://github.com/G-dH/vertical-workspaces/issues/264))
* Window preview *App Icon Click Action* option was ignored


### v49.1 (2025-09-26)
**Fixed**
* Dark Dash style not removed on disable
* Missing Dash's top margin when Dash module was disabled


### v49.0 (2025-09-19)
**Added**
* **Keyboard shortcuts in Overview**:

  * `Ctrl + Shift + Arrow` — Move a window directly to an adjacent monitor
  * `Super + Arrow` — Switch workspace
  * The search entry is now always visible in the app grid view when *App Grid Search Mode* is enabled
* New *Dark* Dash style option

**Fixed**
* Workspace switch gestures now respect *Workspace Switcher Mode > Current Monitor* (only for desktop switcher; still unsupported in overview)
* Direct transitions between desktop and app grid no longer include an unnecessary step through the window picker
* Search view transitions and visibility issues
* Reduced risk of duplicate GObject class names causing random errors (#243)
* Performance issues in overview when *Sort Windows by Most Recently Used* was enabled
* Settings window now properly updates option sensitivity when module state changes
* Multi-line app grid icon names in the bottom row are no longer clipped
* *Window Title Position: Below Window* no longer incorrectly places the title inside the window
* Workspace switcher *Static Background* animation option no longer causes windows without `wm_class` to disappear (#259)
* Improved compatibility with *DING* and *Conky* when using workspace switcher *Static Background* animation
* Overview background now correctly updates after canceling a search started from the App Grid (#258)
* *App Grid Search Mode* option no longer breaks search from App Grid when the *Search* module is disabled

**Other Changes**

* `Super + Tab` in overview always switches workspaces (even with a secondary monitor connected); `Alt + Tab` switches between monitors
* App icon action **Move App to Current Workspace** now moves windows to the monitor with the mouse pointer
* Refactored and optimized V-Shell-specific overview transitions
* Updated Italian translation
* Updated French translation


### v48.9 (2025-06-08)
**Added:**
- French translation by @p-sage (#236)
- Keyboard shortcuts in Overview:
  - `Shift + Arrow` to move a window between workspaces
  - `Ctrl + Shift + Arrow` to move a window to a new workspace
- New window preview options: *Window Title Position/ Visibility* > *On Top / On Top - Always Visible* for better navigation between similar looking windows 

**Fixed:**
- Window preview selection not working after switching workspaces with Page Up/Down
- Window title readability issue on secondary monitors (#238)
- `Ctrl + Shift + Del` closed all windows on the workspace instead of just the current monitor
- Missing default value for the App Grid Brightness in profiles 2-4
- Search view style glitches

**Changed:**
- `Tab` key workspace switcher in the Overview now ignores the last empty workspace 


### v48.8 (2025-05-07)
**Added:**
- A search view style option that allows using the dark background style even outside of static workspace overview mode

**Fixed:**
- Workspace thumbnails can stuck with 0 vertical scale
- Tab key navigation inside app grid, including app folders
- Overview background transition from the search view
- Default app grid search result sometimes not seleceted
- Short search entry transition when search results use dark background
- App Grid icons may overlap the search entry if the *App Grid Page Height Scale* is set above 80 and *Filter App Grid View* search mode is active


### v48.7 (2025-04-24)
**Added:**
- Hotkeys `Shift+Enter` and `Ctrl+Shift+Enter` to move the selected window and all windows of the selected app, respectively, to another monitor (if connected) from the Activities overview. The target monitor is the one with the mouse pointer or the next monitor on the list if the pointer is on the same monitor


### v48.6 (2025-04-15)
**Added:**  
- Options to sort and automatically select window previews in the overview — *Behavior → Workspace Preview → Sort Windows / Select Window*
- Support for searching apps by package type (Snap, Flatpak, AppImage)
- Text shadows for search results to improve readability on light backgrounds
- *Window Height Compensation* option in the *Behavior* tab’s *Workspace Preview* section, which controls the amount of height compensation for smaller window previews (#227)
- The *Show Wallpaper* option now has two choices: *Enable – Fast Blur Transition* and *Enable – Smooth Blur Transition*. Both are actually smooth, but the fast method uses an opacity transition between two layers, while the latter directly controls the blur effect radius during the transition, which has higher hardware performance requirements
- Separate background brightness option for the App Grid
- Workspace thumbnail animation when reordering workspaces (using Shift+Page Up/Down or Shift+Scroll Up/Down in the overview)
- Launch animation when a folder icon is dropped on a workspace thumbnail
- Option *Include Settings Panels in App Results* in the *Search* section of the *Behavior* tab, allowing you to access GNOME Settings panels more quickly from the app search results
- *Delete* hotkey for closing windows from the Overview
- *Super+Tab* hotkey can now be used in the Overview to cycle keyboard focus through monitors on multi-monitor systems, or through workspaces on single-monitor systems
- App search provider: Double-dot `..` prefix to the search query allows you to isolate system actions (*Power Off*, *Log Out*, etc.)

**Fixed:**  
- Workspace preview scaling after reordering workspaces
- App Grid page navigation arrows not being vertically centered in app folders
- Inconsistent spacing between the title and icon grid in app folder dialogs
- Overview background transition glitch when static overview mode is active
- Overview background blur not updating immediately when the wallpaper is changed (#223)
- Overview glitching after changing configuration settings
- Potential incorrect window preview scaling when *Expose Windows on Hover* mode is active
- Overview background blur and brightness configuration breaking after a wallpaper image change
- Workspace thumbnails' background covering windows after a wallpaper image change
- The *Always Activate Selected* option overriding window activation from the dash
- The *Click Empty Space to Close* option interfering with window preview click actions

**Changed:**  
- Removed the vignette effect (darkened edges) from the overview background, allowing the same brightness for both the desktop and the overview
- Search view style for the *Static Workspace* overview mode, making the search entry part of the search results panel


### v48.5 (2025-03-12)
**Fixed:**
- Workspace preview in the overview not responding to clicks


### v48.4 (2025-03-10)
**Added:**
- App Grid option "Remember Page", which allows you to open the app grid and app folders on the last page you left instead of always opening on the first one

**Fixed:**
- *App Grid Search Mode* focus navigation - now the keyboard navigation follows the default search view behavior and allows seamless navigation between the search entry and app grid icons using the Tab and Arrow keys
- Dash can be below workspace in the overview
- Tab key navigation between windows in the overview doesnt work (upstream bug [5345](https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/5345) introduced in GNOME 40, fixed by implementing merge request [2591](https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/2591))
- Double-press Super key action is hard to activate when animation time is set too short
- Minor glitches


### v48.3 (2025-03-02)
**Added:**
- Options to hide the *Close* button and configure the *Remove folder* button in the app folder dialog

**Fixed:**
- Possible overview background glitching when related settings were changed during a session
- Panel visibility transitions and glitching at startup
- App folder opens last used page instead of the first one (upstream bug)
- Dash is not always on top in the overview
 

### v48.2 (2025-02-18)
**Fixed:**
- Compatibility with GNOME 48.beta
- Glitching blurred background on secondary monitor
- Poor performance when transitioning to a blurred background
- App folder dialog padding
- Errors after opening overview when workspaces are disabled on secondary monitors
- Errors when reconnecting monitors
- Overview transitions when using multiple overview modes
- Refactored Panel module; fixed issue where hidden panel was visible on adjacent monitor
- Spacing in switch workspace animation


### v48.1 (2025-02-07)
**Fixed:**
- *Workspace Switcher Mode* > *Current Monitor* buggy in GNOME 48

### v48.0 (2025-02-02)
**Added:**
- GNOME 48 support
- Panel overview style option

**Fixed:**
- Panel not being visible when set to *Overview Only* and *Static Workspace* overview mode is activated while the global overview mode configuration differs


### v47.5 (2025-01-27)
**Added:**
- The maximum number of search results can now be set to less than 5
- New workspace animation options: *All Workspaces* and *Active Workspace Only*. Previously, V-Shell only supported the *Active Workspace Only* animation

**Fixed:**
- Search results lose focus when the overview animation finishes
- App grid becomes invisible when *Filtered App Grid View* search is activated during the overview animation
- When static workspace mode is enabled, changing the workspace mode (using *arrow* or *Tab* keys) during the overview animation is not possible
- *Show WS Thumbnail Label on Hover* option causes thumbnails to crash
- Default search result is not selected when *WSP* extension is activated from V-Shell
- Secondary monitor workspace thumbnails animation ends (and begins) before reaching the edge of the monitor
- Search entry style switching in Static Overview mode

**Changed:**
- Search view transitions have been refactored and improved
- WS 40+ profile overview transitions have been adjusted to behave more similarly to the default GNOME Shell


### v47.4 (2025-01-14)
**Added:**
- Options to control added app menu items (#210)

**Fixed:**
- Workspace thumbnails may change size when searching for apps in the app grid with *Filtered App Grid View* option enabled 


### v47.3 (2025-01-10 e.g.o)
**Fixed:**
- Dash: Overview closes after moving app windows to the current workspace using Shift+Click
- Dash: Unexpected behavior when clicking an app icon with Isolate workspace or Click action > Prefer workspace options enabled


### v47.2 (2025-01-08 e.g.o)
**Fixed:**
- Overview background transition in Static Workspace mode
- Overview and app folder animations not starting from the beginning
- Workspace thumbnails changing size at the end of a trackpad gesture
- Dash app label spacing when GNOME Shell 3.x style is disabled in vertical orientation
- Sorting of search results in the app grid view when the *Filtered App Grid View* option is enabled
- Secondary monitor workspace preview position when *Shift Overview by Panel Height* enabled
- Secondary button click on app folder icon closes overview when *Click Emty Space to Close* option enabled
- Clicking on workspace thumbnails closes overview when *Click Empty Space to Close* option is enabled
- Clicking on the last workspace thumbnail in static workspace mode not exposing windows
- Window preview middle button action set to *Create Window Thumbnail* only works when the secondary button is set the same

**Added**
- Activate current window after entering overview

**Changed:**
- Removed spacing between workspaces in workspace switcher animation


### v47.1 (2024-11-21)
**Added:**
- Italian translation
- Czech translation

**Fixed:**
- Visual glitch in dash icons
- Spacing in the Profie page of the Settings window 

### v47.0 (2024-09-27)
**Added:**
- GNOME 47 support

### v46.4 for GNOME 45.2+ (moved to 47.0), v44.14 for GNOME 42-44 (not yet released)
**Fixed:**
- App grid: Inconsistent grid size on the same monitor when switching monitors (#160)
- App grid: The grid layout manager's current page being out of sync with the grid's current page causes page shifts while dragging app icons and incorrect page navigation controls (#160, upstream bug)
- App grid: After dragging an icon out of a multi-page folder, the folder view shows navigation hints the next time it is opened (#160, upstream bug)
- App grid: Grid page switches to the page with selected icon when user starts dragging an icon on another page
- App grid: Page indicators don't accept drop, so the app icon can't be moved to a new page
- App grid: Keyboard navigation inside a folder doesn't work (upstream bug, fixed in GS 47)
- App grid: Workspace thumbnails not re-scaling after switching workspace outside of the overview using a trackpad
- Vertical dash: Running dot position in GNOME 46.0 (Ubuntu 24.04)

**Added:**
- GNOME 47 support
- *Adaptive* options for the maximum dash and app search icon size that supports low resolution and highly scaled displays
- Search view scroll bar style to make it visible
- App grid: Drag-and-drop between folders
- App grid: Added an option *App Grid Search Mode* that can be set to *Filter App Grid View*, which filters the app grid icons while you're typing, instead of switching to the default search view
- App grid: Added *Alphabet* sorting option that sorts folders along with apps


### v46.3.1  for GNOME 45.2+ (2024-06-10), v44.14 for GNOME 42-44 (not yet released)
**Fixed:**
- *App Grid Page Height Scale* option affects folder icon size
- *Smooth App Grid Animations* options has no effect


### v46.3  for GNOME 45.2+ (2024-06-08), v44.14 for GNOME 42-44 (not yet released)
**Fixed:**
- App grid icon order and grid dimensions issues (#160)
- App grid partially visible after login
- Vertical dash running app indicator position in GNOME 46.2 (#150)
- Dash label border radius is set too high for multiline labels
- Search entry position in some overview configurations (#161)
- Window attention handler options don't work properly

**Added**
- App grid *App Grid Page Height Scale* option
- Separated *Folder Grid Spacing* option


### v46.2  for GNOME 45.2+ (2024-05-15), v44.13 for GNOME 42-44 (2024-05-15)
**Fixed:**
- Inconsistent behavior of dash icons and app grid icons (#152)
- Sorting option doesn't work for app folders (#154)
- V-Shell overrides Dash to Dock's background opacity setting (#155)
- Conflicts with Dash2Dock Animated (#153)
- When the main panel is set to show only in the overview, its content might be unclickable (#157)
- Workspace thumbnails DND can be difficult to use when creating new workspaces (#128)


### v46.1  for GNOME 45.2+ (2024-05-09), v44.12 for GNOME 42-44 (2024-05-09)
**Fixed:**
- Fixed conflicts with Dash to Dock that could cause GNOME to crash at startup
- Resolved issue where V-Shell affected Dash to Dock icon highlighting
- Corrected search entry and results allocation to consider Dash to Dock
- Adjusted app folder dialogs for proper sizing and positioning
- Aligned secondary monitor overview with the primary one (option)
- Removed all code related to previously removed modules
- Fixed GNOME Shell recovery when V-Shell is disabled
- The *App Grid Page Width Scale* option now works for all configurations

**Added:**
- Added *Delay at Startup* option to allow delaying activation of V-Shell after login. Automatically enabled when Dash to Dock, Ubuntu Dock, or Dash to Panel is detected
- Added *Click Empty Space To Close* option
- Added close button to the app folder dialog

**Changed**
- Refactored the app grid module for improved efficiency and reliability
- Removed the 32px option for app grid icon size
- Moved the *Remove* folder button to the left side of the folder dialog
- Adjusted folder grid columns and rows settings to serve as maximum limits rather than fixed page size, allowing for better control over the default adaptive algorithm
- Relocated all app grid settings to a separate tab for better organization


### v46.0 for GNOME 45.2+ (2024-03-30 ego), v44.12 for GNOME 42-44 (not released)
**Added**
- Support for GNOME 46
- Option *Fix New Window Not On Current Monitor* tries to work around that issue. However, success rate is not 100%

**Changed**
- Windows and Extensions search providers have been removed from the V-Shell and released as a standalone WSP and ESP extensions. Respective module switches has been replaced in Settings by the links to these new extensions
- Window thumbnails (PiP) module moved to the standalone extension WTMB, link added to the *Modules* tab of Settings window
- Shortcuts in the overview - `Ctrl+Space` - Extensions Search Provider, `Shift+Space` - Recent Files Search Provider, `Ctrl+Shift+Space` - V-Shell Settings
- Bottom OSD position moved so it's not overlapping dock, if used
- Active folder icons hover animation from scale, which makes icons blurry, to the move 3px up

**Fixed:**
- Running app indicators too close to the app name on the app grid
- OverlayKey module deactivates itself even if its configuration isn't consistent with the default GNOME Shell behavior


### v45.3 for GNOME 45.2+, v44.11 for GNOME 42-44 (2023-12-20)
**Added:**
- Option *Workspace Switcher Mode (Isolate Monitors)* can simulate independent switching of workspaces on any monitor
- Improved *Extensions Search Provider* allows seamless extension de/activation

**Fixed:**
- DtD breaks overview on the primary monitor because of incorrect dash/dock position readings
- *Window Switcher > Ignore Last (empty) Workspace* should work only for dynamic workspaces mode
- *OverlayKey* module should remain disabled when the overlay-key functionality is set to default to minimize conflicts with other extensions
- Errors from parental manager when registering search provider modules
- Extension settings window sometimes fails to open when another extension settings window is already open
- Vertically oriented dash items should be selectable even with the mouse pointer at the edge of the screen


### v45.2 for GNOME 45.2+, v44.10 for GNOME 42-44 (2023-12-02)
**Added:**
- *Dash* option *Isolate Workspaces* on *Behavior* tab
- *Brightness for Search View* option allows adjusting background wallpaper brightness in overview search view
- *Extensions Search Provider* module allows to search for extensions from the overview, open their settings and enable or disable them


### v45.1 for GNOME 45.1+ (EGO 2023-11-25) v44.9 for GNOME 42-44 (not released)
**Added:**
- *Window Thumbnail - PIP* option in app icon menu and as an click actions for Window Preview
- Workspace switcher options *Wraparound* and *Ignore Last (empty)*
- *Overlay key (Super)* and *Hot Corner* actions offer different overview modes independent on global *Overview Mode*
- Workspace thumbnails background without wallpaper is now semi-transparent to match other overview elements
- App Grid sorting options allow alphabetical order with folders

**Fixed:**
- App grid has less rows than it should
- Many minor fixes that reflect gnome-shell development and backports
- Centered app folder position on multi-monitor system
- Window can't be activated using touchscreen
- Setting background wallpaper too early on startup can crash Wayland session

**Other changes:**
- Since GNOME 45 V-Shell has 2 versions - one for GS 45 and the second for GS 42-44. Versioning no longer depends on EGO's upload counter
- Dash light style background opacity is not limited
- Refactored Recent Files Search Provider and other modules
- Settings window - ComboBox replaced with (finally fixed) DropDown


### v37 (2023-07-01)
**Fixed:**
- False detections of conflicting extensions


### v36 (2023-07-01) (35/34/33/32/31 skipped due to issues with extensions.gnome.org)
**Added:**
- Option *Fix New Windows Not In Focus* on *Misc* tab

**Fixed:**
- Improved compatibility with Dash to Dock extension - hidden dock in the overview, broken layout after startup
- Compatibility with Hide Top Bar extension
- App search provider ignores non-localized app names
- App folders grid dimensions wrong if set to *Adaptive* and folder icon is set to a fixed size
- Dash and active app folder icons running indicator position
- Blur/Brightness transitions in static overview mode
- Hot corner edge barrier can be active even if hot corner is disabled
- Disabling dash module does not reset dash position to default

**Other changes:**
- Removed css class reducing Quick Settings buttons height in GNOME 44


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
