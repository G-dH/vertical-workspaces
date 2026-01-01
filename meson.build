project('vertical-workspaces')

gnome = import('gnome')
i18n = import('i18n')

uuid = 'vertical-workspaces@G-dH.github.com'
rdnn = 'org.gnome.shell.extensions.vertical-workspaces'

datadir = get_option('datadir')
extension_dir = datadir / 'gnome-shell' / 'extensions' / uuid

install_data(
  [
    'extension.js',
    'metadata.json',
    'prefs.js',
    'stylesheet.css',
  ],
  install_dir : extension_dir,
)

install_subdir('lib', install_dir : extension_dir)
install_subdir('icons', install_dir : extension_dir)

subdir('schemas')
subdir('po')
