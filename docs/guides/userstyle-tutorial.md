# Userstyle Tutorial

Some Go players are quite picky when it comes to stones and board textures. I'm
not saying Seki's textures look the best or are realistic, but I daresay they're
quite good. However, if you really have to, you can actually change them using
userstyles.

Using userstyles is an easy way to change Seki's appearance without having to
replace any important files and without having the changes reverted with the
next update.

## Determine `styles.css` location

First, determine where Seki saves its settings:

- `%APPDATA%\Seki` on Windows
- `$XDG_CONFIG_HOME/Seki` or `~/.config/Seki` on Linux
- `~/Library/Application Support/Seki` on macOS
- `<portable executable directory>\Seki` for Windows portable builds

Inside the folder there's a file named `styles.css`. Any CSS statement inside
this file will be loaded when Seki starts up. It can be helpful to
[open the developer tools](debugging.md) to look at the DOM.

Take a look at
[Shudan's documentation](https://github.com/SabakiHQ/Shudan/tree/master/docs#styling)
to see how to change board and stone images.
