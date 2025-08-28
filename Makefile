SHELL := /bin/bash

# Replace these with the name and domain of your extension!
NAME     := vertical-workspaces
DOMAIN   := G-dH.github.com
ZIP_NAME := $(NAME)@$(DOMAIN).zip

# Some of the recipes below depend on some of these files.
JS_FILES       = $(shell find -type f -and \( -name "*.js" \))
UI_FILES       = $(shell find -type f -and \( -name "*.ui" \))
#RESOURCE_FILES = $(shell find resources -mindepth 2 -type f)
LOCALES_PO     = $(wildcard po/*.po)
LOCALES_MO     = $(patsubst po/%.po,locale/%/LC_MESSAGES/$(NAME).mo,$(LOCALES_PO))
SCHEMA_XML     = $(wildcard schemas/*.xml)

# These files will be included in the extension zip file.
ZIP_CONTENT = $(JS_FILES) $(LOCALES_MO) \
              $(SCHEMA_XML) schemas/gschemas.compiled metadata.json LICENSE stylesheet.css

# These six recipes can be invoked by the user.
.PHONY: all zip install uninstall pot clean

all: $(ZIP_CONTENT)

# The zip recipes only bundles the extension without installing it.
zip: $(ZIP_NAME)

# The install recipes creates the extension zip and installs it.
install: $(ZIP_NAME)
	gnome-extensions install "$(ZIP_NAME)" --force
	@echo "Extension installed successfully! Now restart the Shell ('Alt'+'F2', then 'r' or log out/log in on Wayland)."

# This uninstalls the previously installed extension.
uninstall:
	gnome-extensions uninstall "$(NAME)@$(DOMAIN)"

# Use gettext to generate a translation template file.
pot: $(JS_FILES) $(UI_FILES)
	@echo "Generating '$(NAME).pot'..."
	@xgettext --from-code=UTF-8 \
	          --add-comments=Translators \
	          --copyright-holder="GdH" \
	          --package-name="$(NAME)" \
	          --output=po/$(NAME).pot \
	          $(JS_FILES) $(UI_FILES)

# This removes all temporary files created with the other recipes.
clean:
	rm -rf $(ZIP_NAME) \
	       schemas/gschemas.compiled \
	       locale

# This bundles the extension and checks whether it is small enough to be uploaded to
# extensions.gnome.org. We do not use "gnome-extensions pack" for this, as this is not
# readily available on the GitHub runners.
$(ZIP_NAME): $(ZIP_CONTENT)
	@echo "Packing zip file..."
	@rm --force $(ZIP_NAME)
	@zip $(ZIP_NAME) -- $(ZIP_CONTENT)

	@#Check if the zip size is too big to be uploaded
	@SIZE=$$(unzip -Zt $(ZIP_NAME) | awk '{print $$3}') ; \
	 if [[ $$SIZE -gt 5242880 ]]; then \
	    echo "ERROR! The extension is too big to be uploaded to" \
	         "the extensions website, keep it smaller than 5 MB!"; \
	    exit 1; \
	 fi

# Compiles the gschemas.compiled file from the gschema.xml file.
schemas/gschemas.compiled: schemas/org.gnome.shell.extensions.$(NAME).gschema.xml
	@echo "Compiling schemas..."
	@glib-compile-schemas schemas

# Compiles the gresource file from the gresources.xml.
#resources/$(NAME).gresource: resources/$(NAME).gresource.xml
#	@echo "Compiling resources..."
#	@glib-compile-resources --sourcedir="resources" --generate resources/$(NAME).gresource.xml

# Generates the gresources.xml based on all files in the resources subdirectory.
#resources/$(NAME).gresource.xml: $(RESOURCE_FILES)
#	@echo "Creating resources xml..."
#	@FILES=$$(find "resources" -mindepth 2 -type f -printf "%P\n" | xargs -i echo "<file>{}</file>") ; \
	 echo "<?xml version='1.0' encoding='UTF-8'?><gresources><gresource> $$FILES </gresource></gresources>" \
	     > resources/$(NAME).gresource.xml

# Compiles all *.po files to *.mo files.
locale/%/LC_MESSAGES/$(NAME).mo: po/%.po
	@echo "Compiling $@"
	@mkdir -p locale/$*/LC_MESSAGES
	@msgfmt -c -o $@ $<

