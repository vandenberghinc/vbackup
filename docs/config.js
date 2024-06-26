module.exports = {
	name: "VBackup",
	version: "1.1",
	icon: {
		dark: "https://raw.githubusercontent.com/vandenberghinc/vbackup/master/media/stroke.light.png",
		light: "https://raw.githubusercontent.com/vandenberghinc/vbackup/master/media/stroke.dark.png",
        height: 22.5,
	},
    include: [
        "src/server.js",
        "cli.js"
    ],
    output: "docs/index.html",
    light_theme: {
    	extends: "light",
    	tint_fg: "linear-gradient(135deg, rgb(87, 149, 243), rgb(88, 182, 132))",
    	tint_base: "rgb(87, 149, 243)"
    },
    dark_theme: {
    	extends: "green",
    	tint_fg: "linear-gradient(135deg, rgb(87, 149, 243), rgb(88, 182, 132))",
    	tint_base: "rgb(87, 149, 243)"
    },
    meta: {
        author: "Daan van den Bergh",
    	title: "VBackup",
    	description: "Create a backup server with ease."
    },
    use_language_navigations: false,
    sidebar_images: {
        "vbackup.Server": "cloud",
        "CLI": "terminal",
    }
}