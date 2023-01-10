# Vertical Workspaces  - Now also horizontal!

A GNOME Shell extension that allows you to customize your desktop interface to fit your workflow and eye. You can change the horizontal stacking of workspaces to vertical, but also change layout, content, appearance and behavior of Activities overview and workspace switcher.

Supported GNOME versions: 42, 43 (dropped support for 40, 41  - not tested).

## Features (mostly related to the Activities overview)
- Vertically or horizontally stacked workspaces.
- Position, orientation, size and visibility of dash and workspaces thumbnails.
- Support for secondary monitors, workspaces thumbnails can be placed on the opposite side relative to primary monitor. Removes unnecessary transitions.
- Scale, spacing and background visibility of workspaces previews.
- Static background in with blur adjustments.
- 2 overview modes with static windows that spread on hover / click on workspace thumbnail.
- More efficient and visually appealing (compared to the original Shell) transition animations that can be customized or disabled.
- Better performance on slower system (compared to original Shell).
- Size adjustments of dash icons and window preview icons.
- Adjustment of dash background transparency and corner radius.
- Workspace thumbnails can show background wallpaper and labels (always or on mouse hover) with combination of workspace index, name of the current application and workspace name.
- Title captions of window previews moves into the preview (originally beneath the preview) and can be set as always visible.
- Static background in workspace switcher (outside overview).
- Animation/transition speed adjustment.


[<img alt="" height="100" src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true">](https://extensions.gnome.org/extension/5177/vertical-workspaces/)

![Various Overview Layouts](screenshots/screenshot.jpg)

## Installation

### Installation from extensions.gnome.org
The easiest way to install Vertical Workspaces: go to [extensions.gnome.org](https://extensions.gnome.org/extension/5177/vertical-workspaces/) and toggle the switch. This installation also gives you automatic updates in the future.

### Installation from the latest Github release
Download the latest release archive using following command:

    wget https://github.com/G-dH/vertical-workspaces/releases/latest/download/vertical-workspaces@G-dH.github.com.zip

Install the extension (`--force` switch needs to be used only if some version of the extension is already installed):

    gnome-extensions install --force vertical-workspaces@G-dH.github.com.zip

### Installation from GitHub repository
The most recent version in the repository is the one I'm currently using and developing on my own systems, problems may occur, but usually nothing serious.
You may need to install `git`, `gettext` and `glib2.0` for successful installation.
Navigate to the directory you want to download the source code and execute following commands in the terminal:

    git clone https://github.com/G-dH/vertical-workspaces.git
    cd vertical-workspaces/
    make install

### Enabling the extension
After installation you need to enable the extension and access its settings.

- First restart GNOME Shell (`ALt` + `F2`, `r`, `Enter`, or Log Out/Log In if you use Wayland)
- Now you should see *Vertical Workspaces* extension in *Extensions* application (re-open the app if needed to load new data), where you can enable it and access its Preferences window by pressing `Settings` button.

## Credits
This extension uses customized utils and dash modules of the [Vertical Overview extension](https://github.com/RensAlthuis/vertical-overview).

## Buy me a coffee
If you like my extensions and want to keep me motivated, you can also buy me a coffee:
[buymeacoffee.com/georgdh](https://buymeacoffee.com/georgdh)

![Settings window](screenshots/screenshot1.png)
![Settings window](screenshots/screenshot2.png)
![Settings window](screenshots/screenshot3.png)
![Settings window](screenshots/screenshot4.png)
![Settings window](screenshots/screenshot5.png)