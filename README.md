# V-Shell

A GNOME Shell extension that lets you customize and enhance your GNOME Shell UX to suit your workflow, whether you like horizontally or vertically stacked workspaces.

Currently supported GNOME versions: 42 - 49.</br>
The `main` branch, which always contains the most recent version, supports GNOME 45–49. New features and optimizations are backported to the `gnome-42-44` branch with a delay.

[<img alt="" height="100" src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true">](https://extensions.gnome.org/extension/5177/vertical-workspaces/)

![Custom Overview Layout](screenshots/screenshot.jpg)

## Features
- Supports both vertically and horizontally stacked workspaces
- Customizable overview layout, appearance and behavior
- Customizable secondary monitor overview
- Enhanced overview keyboard navigation and control supporting secondary monitors
- Static overview modes minimize unnecessary screen content movement
- Optional hot corner/edge position
- Customizable panel visibility
- Customizable app grid and app folders - icon size, dimensions, sorting, active folder previews
- Customizable dash - icon size, appearance and behavior, workspace isolation, click and scroll actions
- Customizable search - results width, number of results, improved searching
- Customizable workspace switcher - static background
- Notification and OSD positions and behavior
- Window attention handler behavior
- Customizable Super key behavior
- Keyboard and mouse shortcuts allow advanced workspace and window control
- 4 predefined and fully customizable profiles


## Added functionality
This section explains some of the less obvious and invisible additions to the Shell's behavior.

### Activities overview
#### Right click on Activities button (now also workspace indicator) opens App Grid
If you're using a mouse, you can open the app grid directly by clicking the Activities button with the secondary mouse button.

#### Hot corner
V-Shell lets you choose which corner opens the Activities overview. You can also make the whole edge of the screen work as a trigger. This can be set in *Hot Corner* > *Position* on the *Behavior* tab of the *Settings* window. The `Follow Dash` option picks the corner closest to the first icon in the Dash. The `Follow Dash - Hot Edge` option makes the whole screen edge where the Dash is active. **Be aware that the hot edge may block the mouse pointer from accessing the secondary monitor**.

#### Keyboard and mouse shortcuts in the window picker view
V-Shell fixes the Tab key navigation and adds more hotkeys to control windows and workspaces

| Hotkey | Description |
|--------|-------------|
|`Tab`                                               | Select next window on the current workspace. Shift reverses direction|
|`Super + Tab`                                       | Cycle keyboard focus between not-empty workspaces. Shift reverses direction|
|`Alt + Tab`                                         | Cycle keyboard focus between not-empty monitors. Shift reverses direction|
|`Super + Arrows`                                    | Switch workspace
|`Ctrl + Tab`                                        | Focus Dash|
|`Shift + click (activate)` app icon                 | Move all windows of the application to the current workspace. Works in Dash, Search and App Grid, you can use mouse click or *Enter* and *Space* keys to activate the icon|
|`Shift + Page Up/Down`, `Shift + Scroll`            | Reorder current workspace|
|`Shift + Enter`                                     | Move selected window to the next monitor|
|`Ctrl + Shift + Enter`                              | Move all windows of the selected application on the current monitor to the next monitor|
|`Super + Shift + Arrow`                             | Move window to the adjecent monitor in the `Arrow` key direction|
|`Del`                                               | Close selected window|
|`Ctrl + Shift + Del`                                | Close all windows on the current workspace and monitor|
|`Shift + Ctrl + Space`                              | Open V-Shell *Settings* window|
|`Space`                                             | Activate window search with all open windows if *WSP (Window Search Provider)* extension is installed and enabled| 
|`Ctrl + Space`                                      | Activate extensions search with all installed extensions if *ESP (Extensions Search Provider)* extension is installed and enabled|
 
#### New buttons
|Button| Description|
|------|------------|
| *Close button in workspace thumbnail*     | Close all windows on the workspace. Default configuration requires double-click |
| *Trash button in app folder*              | Remove folder - move all icons to the main grid. Default configuration requires double-click |


### Search improvements
V-Shell enhances the default app search by adding categories and executables from app launchers to the search sources, while prioritizing app names.

#### App results can include GNOME Settings
V-Shell provides an option to include GNOME Settings panels in the app results, making them more quickly accessible than through the separate list box.

#### Type two dots to isolate system functions
You can use two dots (`..`) before a search query to isolate system functions included in the app search results - for example, type `..log`, `..out`, or even `..g` to access the logout dialog. Or type the dots and select the desired function using tha *Tab* key or arrow keys.

#### Move application windows to the current workspace
If you activate an app icon while holding the `Shift` key, all of its windows will be moved to the current workspace. This works also for Dash icons.  


### App Grid

#### Type to filter app grid
The default V-Shell configuration features a searchable app grid, allowing you to filter its content, including app folders, simply by typing when the app grid view is active. It delivers the same results as the default app search but without the constraint of the search view width. Additionally, V-Shell can search for apps by categories embedded in their launchers, making it easy to find all *system*, *game*, *internet*, or *video* applications. This functionality minimizes the need for manually organizing apps into visual categories.

#### Active icons in app folder previews
To enhance the efficiency of the application menu when using the mouse, V-Shell offers the *Active Icons in Folder Preview* option. When enabled, icons in the folder preview (folder icon) behave like regular app icons, allowing users to interact with them without opening the folder. V-Shell allows you to increase the number of icons in the preview from 4 to 9, as well as adjust the size of the app grid icons. This feature enables the folder icons to divide the main app grid into sections, with the most frequently used apps readily accessible while others remain hidden deeper within folders.

![Custom Overview Layout](screenshots/screenshot0.jpg)
 
#### Open all apps in the folder at once
Simply drag-and-drop folder onto a workspace thumbnail to open all containing applications.


## Known issues
### Workspace navigation shortcuts
The default GNOME Shell configuration includes predefined shortcuts for workspaces oriented in both axis:
`(Shift)+Ctrl+Alt+ Arrow Keys`
and for horizontal only:
`(Shift)+Super+PageUp/Down`

The default GNOME *Settings* application only offers options to configure keyboard shortcuts for horizontally oriented workspaces. However, the `gSettings` configuration scheme provides keys for shortcuts for vertically oriented workspaces as well. You can access and configure these shortcuts using the **dconf Editor**.

When V-Shell is configured to use vertically stacked workspaces, the `(Shift)+Super+PageUp/Down` shortcuts for switching workspaces stop working.
V-Shell provides the option *Override Page Up/Down Shortcuts* to automatically switch the default `Super+PageUp/Down` and `Shift+Super+PageUp/Down` shortcuts for the current workspace orientation. If enabled, this option will move the shortcuts between following gSettings keys:
| Horizontal orientation | Vertical orientation |
|------------------------|----------------------|
| `switch-to-workspace-left` | `switch-to-workspace-up`|
| `switch-to-workspace-right` | `switch-to-workspace-down`|
| `move-to-workspace-left` | `move-to-workspace-up`|
| `move-to-workspace-right` | `move-to-workspace-down`|

Note that unlike the GNOME *Settings* application, *dconf Editor* allows you to add more than one keyboard shortcut to each action. V-Shell preserves all other shortcuts, only moves following strings between related gSetting keys:
- `<Super>Page_Up`
- `<Super>Page_Down`
- `<Super><Shift>Page_Up`
- `<Super><Shift>Page_Down`

The key order follows the order in which GNOME Settings stores the shortcuts. If you add the same shortcut but with a different key order, V-Shell will not recognize it, and you might end up with the same shortcut assigned to two actions.

### Compatibility with other extensions
V-Shell overrides parts of the GNOME Shell's UI code, and many extensions do the same, so conflicts are inevitable. V-Shell tries to mitigate the consequences of conflicts with the most popular extensions, which includes disabling its own modules. This means that some of V-Shell's settings may not function when conflicting extensions are enabled. V-Shell also provides manual control over its modules so the user can disable problematic ones if needed.

Please, report any incompatibility, you encounter while using V-Shell.

#### V-Shell modules automatically disabled when conflicting extensions are detected
| Module                | Extensions causing module to disable |
|-----------------------|--------------------------------------|
| Dash                  | *Dash to Dock*, *Ubuntu Dock*, *Dash to Panel*, *Dash2Dock Animated* |
| Panel                 | *Dash to Panel*, *Hide Top Bar* |
| Layout                | *Dash to Panel*, *CHC-E*, |
| WorkspaceSwitcherPopup| *WSM (Workspace Switcher Manager)* |

#### Extensions causing V-Shell to automatically delay its activation
to prevent crashes upon GNOME Shell starting up:
- *Dash to Dock*
- *Ubuntu Dock*
- *Dash to Panel*
- *Dash2Dock Animated*

You can enable this option manually if needed, using the *Delay at Startup* option on the *Misc* tab of the *Settings* window.

#### Extensions whose functionality is included in V-Shell
and should be disabled or restricted by the user:
- Partially *Blur My Shell* - V-Shell provides a basic settings for the overview background, including brightness and blur effects. If you want to use *Blur My Shell*, consider disabling its options for the overview, including app folders, to prevent visual glitches and inconsistency during transitions between overview states.
- *Alphabetical App Grid* - V-Shell provides much more options than alphabetical sorting
- *Grand Theft Focus* and other extensions preventing showing notification instead of immediately focusing the window that demands attention
- *Hot Edge* - V-Shell provides this functionality as an option of the *Hot Corner Position* setting
- Some of the *Just Perfection* options including overview elements visibility and size, notifications/OSD positions, hiding main panel, animation speed, and more
- *Impatience* and extensions adjusting animation speed
- *Click to close overview* - V-Shell provides the *Click Empty Space To Close* option


## Changelog
See what's changed in recent versions
[CHANGELOG.md](CHANGELOG.md)


## Installation

### Installation from extensions.gnome.org
The easiest way to install the latest stable release of V-Shell: go to [extensions.gnome.org](https://extensions.gnome.org/extension/5177/vertical-workspaces/) and toggle the switch.

### Installation from the latest Github release
Download the latest release archive using following command:

    wget https://github.com/G-dH/vertical-workspaces/releases/latest/download/vertical-workspaces@G-dH.github.com.zip

Install the extension (`--force` switch needs to be used only if some version of the extension is already installed):

    gnome-extensions install --force vertical-workspaces@G-dH.github.com.zip

### Installation from GitHub repository
The most recent version in the repository is the one I'm currently using and developing on my own systems, problems may occur, but usually nothing serious. The repository version may change often and doesn't updates automatically on your system. If you want to help me, use this latest version and report bugs.
You may need to install `git`, `make`, `gettext` and `glib2.0` for successful installation.
Navigate to the directory you want to download the source code and execute following commands in the terminal:

**GNOME 45+:**

    git clone https://github.com/G-dH/vertical-workspaces.git
    cd vertical-workspaces
    make install

**GNOME 42 - 44:**

    git clone https://github.com/G-dH/vertical-workspaces.git
    cd vertical-workspaces
    git checkout gnome-42-44
    make install

If you get `Can't recursively copy directory` error, take a look at issue [#51](https://github.com/G-dH/vertical-workspaces/issues/51).

### Enabling the extension
After installation you need to enable the extension and access its settings.

- First restart GNOME Shell (`ALt` + `F2`, `r`, `Enter`, or Log Out/Log In if you use Wayland)
- Now you should see *Vertical Workspaces* extension in *Extensions* application (re-open the app if needed to load new data), where you can enable it and access its Preferences window by pressing `Settings` button.

## Credits
V-Shell contains modified GNOME Shell source code and was originally based on parts of [Vertical Overview extension](https://github.com/RensAlthuis/vertical-overview).


## Contribution
If you want to help with V-Shell development, please provide feedback, whether it's positive, negative, a bug report, or a feature request. Even if I don't agree with you, it can help improve V-Shell.


## Donations
If you enjoy using my extensions, you can help me with my coffee expenses:

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/yellow_img.png)](https://www.buymeacoffee.com/georgdh)

Any support is greatly appreciated!


## License
This program is distributed under the terms of the GNU General Public License, version 3 or later. See [LICENSE](./LICENSE) file for details.
