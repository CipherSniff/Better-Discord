/**
 * @name ShowHiddenChannels
 * @author DevilBro
 * @authorId 278543574059057154
 * @version 9.9.9
 * @description Displays all hidden Channels, which can't be accessed due to Role Restrictions, this won't allow you to read them (impossible)
 * @invite Jx3TjNS
 * @donate https://www.paypal.me/MircoWittrien
 * @patreon https://www.patreon.com/MircoWittrien
 * @website https://mwittrien.github.io/
 * @source https://github.com/mwittrien/BetterDiscordAddons/tree/master/Plugins/ShowHiddenChannels/
 */

module.exports = (_ => {
	const changeLog = {

	};

	return !window.BDFDB_Global || (!window.BDFDB_Global.loaded && !window.BDFDB_Global.started) ? class {
		constructor (meta) {for (let key in meta) this[key] = meta[key];}
		getName () {return this.name;}
		getAuthor () {return this.author;}
		getVersion () {return this.version;}
		getDescription () {return `The Library Plugin needed for ${this.name} is missing. Open the Plugin Settings to download it. \n\n${this.description}`;}

		downloadLibrary () {
			require("request").get("https://mwittrien.github.io/BetterDiscordAddons/Library/0BDFDB.plugin.js", (e, r, b) => {
				if (!e && b && r.statusCode == 200) require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0BDFDB.plugin.js"), b, _ => BdApi.showToast("Finished downloading BDFDB Library", {type: "success"}));
				else BdApi.alert("Error", "Could not download BDFDB Library Plugin. Try again later or download it manually from GitHub: https://mwittrien.github.io/downloader/?library");
			});
		}

		load () {
			if (!window.BDFDB_Global || !Array.isArray(window.BDFDB_Global.pluginQueue)) window.BDFDB_Global = Object.assign({}, window.BDFDB_Global, {pluginQueue: []});
			if (!window.BDFDB_Global.downloadModal) {
				window.BDFDB_Global.downloadModal = true;
				BdApi.showConfirmationModal("Library Missing", `The Library Plugin needed for ${this.name} is missing. Please click "Download Now" to install it.`, {
					confirmText: "Download Now",
					cancelText: "Cancel",
					onCancel: _ => {delete window.BDFDB_Global.downloadModal;},
					onConfirm: _ => {
						delete window.BDFDB_Global.downloadModal;
						this.downloadLibrary();
					}
				});
			}
		}
		start () {this.load();}
		stop () {}
		getSettingsPanel () {
			let template = document.createElement("template");
			template.innerHTML = `<div style="color: var(--header-primary); font-size: 16px; font-weight: 300; white-space: pre; line-height: 22px;">The Library Plugin needed for ${this.name} is missing.\nPlease click <a style="font-weight: 500;">Download Now</a> to install it.</div>`;
			template.content.firstElementChild.querySelector("a").addEventListener("click", this.downloadLibrary);
			return template.content.firstElementChild;
		}
	} : (([Plugin, BDFDB]) => {
		var blackList = [], overrideTypes = [];
		var hiddenChannelCache = {};
		var accessModal;

		const channelGroupMap = {
			GUILD_TEXT: "SELECTABLE",
			GUILD_VOICE: "VOCAL",
			GUILD_ANNOUNCEMENT: "SELECTABLE",
			GUILD_STORE: "SELECTABLE",
			GUILD_STAGE_VOICE: "VOCAL"
		};

		const typeNameMap = {
			GUILD_TEXT: "TEXT_CHANNEL",
			GUILD_VOICE: "VOICE_CHANNEL",
			GUILD_ANNOUNCEMENT: "NEWS_CHANNEL",
			GUILD_STORE: "STORE_CHANNEL",
			GUILD_CATEGORY: "CATEGORY",
			GUILD_STAGE_VOICE: "STAGE_CHANNEL",
			PUBLIC_THREAD: "THREAD",
			PRIVATE_THREAD: "PRIVATE_THREAD"
		};

		const renderLevels = {
			CAN_NOT_SHOW: 1,
			DO_NOT_SHOW: 2,
			WOULD_SHOW_IF_UNCOLLAPSED: 3,
			SHOW: 4
		};

		const sortOrders = {
			NATIVE: {value: "native", label: "Native Category in correct Order"},
			BOTTOM: {value: "bottom", label: "Native Category at the bottom"}
		};

		const UserRowComponent = class UserRow extends BdApi.React.Component {
			componentDidMount() {
				if (this.props.user.fetchable) {
					this.props.user.fetchable = false;
					BDFDB.LibraryModules.UserProfileUtils.getUser(this.props.user.id).then(fetchedUser => {
						this.props.user = Object.assign({}, fetchedUser, BDFDB.LibraryModules.MemberStore.getMember(this.props.guildId, this.props.user.id) || {});
						BDFDB.ReactUtils.forceUpdate(this);
					});
				}
			}
			render() {
				return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ListRow, {
					prefix: BDFDB.ReactUtils.createElement("div", {
						className: BDFDB.disCN.listavatar,
						children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.AvatarComponents.default, {
							src: BDFDB.UserUtils.getAvatar(this.props.user.id),
							status: BDFDB.UserUtils.getStatus(this.props.user.id),
							size: BDFDB.LibraryComponents.AvatarComponents.Sizes.SIZE_40,
							onClick: _ => {
								if (accessModal) accessModal.props.onClose();
								BDFDB.LibraryModules.UserProfileModalUtils.openUserProfileModal({
									userId: this.props.user.id,
									guildId: this.props.guildId
								});
							}
						})
					}),
					labelClassName: BDFDB.disCN.nametag,
					label: [
						BDFDB.ReactUtils.createElement("span", {
							className: BDFDB.disCN.username,
							children: this.props.user.nick || this.props.user.username,
							style: {color: this.props.user.colorString}
						}),
						!this.props.user.discriminator ? null : BDFDB.ReactUtils.createElement("span", {
							className: BDFDB.disCN.listdiscriminator,
							children: `#${this.props.user.discriminator}`
						}),
						this.props.user.bot && BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.BotTag, {
							style: {marginLeft: 6}
						})
					]
				});
			}
		};

		const RoleRowComponent = class RoleRow extends BdApi.React.Component {
			render() {
				return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ListRow, {
					prefix: BDFDB.ReactUtils.createElement("div", {
						className: BDFDB.disCNS.avataricon + BDFDB.disCNS.listavatar + BDFDB.disCNS.avatariconsizemedium + BDFDB.disCN.avatariconinactive,
						style: {
							boxSizing: "border-box",
							padding: 10
						},
						children: BDFDB.ReactUtils.createElement("div", {
							style: {
								borderRadius: "50%",
								height: "100%",
								width: "100%",
								backgroundColor: BDFDB.ColorUtils.convert(this.props.role.colorString, "RGB") || BDFDB.DiscordConstants.Colors.PRIMARY_DARK_300
							}
						})
					}),
					labelClassName: this.props.role.overwritten && BDFDB.disCN.strikethrough,
					label: BDFDB.ReactUtils.createElement("span", {
						children: this.props.role.name,
						style: {color: this.props.role.colorString}
					})
				});
			}
		};

		return class ShowHiddenChannels extends Plugin {
			onLoad () {
				overrideTypes = Object.keys(BDFDB.DiscordConstants.PermissionOverrideType);

				this.defaults = {
					sortOrder: {
						hidden: {
							value: sortOrders[Object.keys(sortOrders)[0]].value,
							description: "Sorts hidden Channels in",
							options: Object.keys(sortOrders).map(n => sortOrders[n])
						}
					},
					general: {
						showVoiceUsers:			{value: true, 		description: "Show connected Users in hidden Voice Channels"},
						showForNormal:			{value: true,		description: "Add Access-Overview ContextMenu Entry for non-hidden Channels"}
					},
					channels: {
						GUILD_CATEGORY:			{value: true},
						GUILD_TEXT:				{value: true},
						GUILD_VOICE:			{value: true},
						GUILD_ANNOUNCEMENT:		{value: true},
						GUILD_STORE:			{value: true},
						GUILD_STAGE_VOICE:		{value: true}
					}
				};

				this.patchedModules = {
					before: {
						Channels: "render",
						ChannelCategoryItem: "type",
						ChannelItem: "default",
						VoiceUsers: "render"
					},
					after: {
						useInviteItem: "default",
						ChannelItem: "default"
					}
				};

				this.css = `
					${["ShowHiddenChannels", "accessModal"] + BDFDB.dotCN.messagespopoutemptyplaceholder} {
						position: absolute;
						bottom: 0;
						width: 100%;
					}
				`;
			}

			onStart () {
				this.saveBlackList(this.getBlackList());

				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.GuildUtils, "setChannel", {instead: e => {
					let channelId = (BDFDB.LibraryModules.VoiceUtils.getVoiceStateForUser(e.methodArguments[1]) || {}).channelId;
					if (!channelId || !this.isChannelHidden(channelId)) return e.callOriginalMethod();
				}});

				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.UnreadChannelUtils, "hasUnread", {after: e => {
					return e.returnValue && !this.isChannelHidden(e.methodArguments[0]);
				}});

				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.UnreadChannelUtils, "getMentionCount", {after: e => {
					return e.returnValue ? (this.isChannelHidden(e.methodArguments[0]) ? 0 : e.returnValue) : e.returnValue;
				}});

				this.forceUpdateAll();
			}

			onStop () {
				this.forceUpdateAll();
			}

			getSettingsPanel (collapseStates = {}) {
				let settingsPanel;
				return settingsPanel = BDFDB.PluginUtils.createSettingsPanel(this, {
					collapseStates: collapseStates,
					children: _ => {
						let settingsItems = [];

						for (let key in this.defaults.selections) settingsItems.push();

						settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
							title: "Settings",
							collapseStates: collapseStates,
							children: Object.keys(this.defaults.sortOrder).map(key => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
								type: "Select",
								plugin: this,
								keys: ["sortOrder", key],
								label: this.defaults.sortOrder[key].description,
								basis: "50%",
								options: this.defaults.sortOrder[key].options,
								value: this.settings.sortOrder[key]
							})).concat(Object.keys(this.defaults.general).map(key => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
								type: "Switch",
								plugin: this,
								keys: ["general", key],
								label: this.defaults.general[key].description,
								value: this.settings.general[key]
							}))).concat(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsPanelList, {
								title: "Show Channels:",
								children: Object.keys(this.defaults.channels).map(key => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
									type: "Switch",
									plugin: this,
									keys: ["channels", key],
									label: BDFDB.LanguageUtils.LanguageStrings[typeNameMap[key]],
									value: this.settings.channels[key]
								}))
							}))
						}));

						settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
							title: "Server Black List",
							collapseStates: collapseStates,
							children: [
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsGuildList, {
									className: BDFDB.disCN.marginbottom20,
									disabled: blackList,
									onClick: disabledGuilds => this.saveBlackList(disabledGuilds)
								}),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
									type: "Button",
									color: BDFDB.LibraryComponents.Button.Colors.GREEN,
									label: "Enable for all Servers",
									onClick: _ => this.batchSetGuilds(settingsPanel, collapseStates, true),
									children: BDFDB.LanguageUtils.LanguageStrings.ENABLE
								}),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
									type: "Button",
									color: BDFDB.LibraryComponents.Button.Colors.PRIMARY,
									label: "Disable for all Servers",
									onClick: _ => this.batchSetGuilds(settingsPanel, collapseStates, false),
									children: BDFDB.LanguageUtils.LanguageStrings.DISABLE
								})
							]
						}));

						return settingsItems;
					}
				});
			}

			onSettingsClosed () {
				if (this.SettingsUpdated) {
					delete this.SettingsUpdated;
					this.forceUpdateAll();
				}
			}

			forceUpdateAll () {				
				hiddenChannelCache = {};

				BDFDB.PatchUtils.forceAllUpdates(this);
				BDFDB.ChannelUtils.rerenderAll();
			}

			onUserContextMenu (e) {
				if (e.subType == "useUserManagementItems" || e.subType == "useMoveUserVoiceItems" || e.subType == "usePreviewVideoItem") {
					let channelId = (BDFDB.LibraryModules.VoiceUtils.getVoiceStateForUser(e.instance.props.user.id) || {}).channelId;
					if (channelId && this.isChannelHidden(channelId)) return null;
				}
			}

			onChannelContextMenu (e) {
				if (e.instance.props.channel && e.instance.props.channel.guild_id && e.subType == "useChannelMarkAsReadItem") {
					let isHidden = this.isChannelHidden(e.instance.props.channel.id);
					if (isHidden || this.settings.general.showForNormal) {
						if (e.returnvalue.length) e.returnvalue.push(BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuSeparator, {}));
						e.returnvalue.push(BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
							label: this.labels.context_channelaccess,
							id: BDFDB.ContextMenuUtils.createItemId(this.name, "permissions"),
							action: _ => this.openAccessModal(e.instance.props.channel, !isHidden)
						}));
					}
				}
			}

			onGuildContextMenu (e) {
				if (e.instance.props.guild) {
					let [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnvalue, {id: "hide-muted-channels"});
					if (index > -1) children.splice(index + 1, 0, BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuCheckboxItem, {
						label: this.labels.context_hidehidden,
						id: BDFDB.ContextMenuUtils.createItemId(this.name, "hide-locked-channels"),
						checked: blackList.includes(e.instance.props.guild.id),
						action: value => {
							if (value) blackList.push(e.instance.props.guild.id);
							else BDFDB.ArrayUtils.remove(blackList, e.instance.props.guild.id, true);
							this.saveBlackList(BDFDB.ArrayUtils.removeCopies(blackList));

							BDFDB.PatchUtils.forceAllUpdates(this);
							BDFDB.ChannelUtils.rerenderAll(true);
						}
					}));
				}
			}

			onGuildHeaderContextMenu (e) {
				this.onGuildContextMenu(e);
			}

			processUseInviteItem (e) {
				if (e.instance.props.channel && this.isChannelHidden(e.instance.props.channel.id)) return null;
			}

			processChannelList (e) {
				if (!e.instance.props.guild || e.instance.props.guild.id.length < 16) return;
				let show = !blackList.includes(e.instance.props.guild.id), sortAtBottom = this.settings.sortOrder.hidden == sortOrders.BOTTOM.value;
				e.instance.props.guildChannels = new e.instance.props.guildChannels.constructor(e.instance.props.guildChannels.id, e.instance.props.guildChannels.hoistedSection.hoistedRows);
				e.instance.props.guildChannels.categories = Object.assign({}, e.instance.props.guildChannels.categories);
				hiddenChannelCache[e.instance.props.guild.id] = [];
				let processCategory = (category, insertChannelless) => {
					if (!category) return;
					let channelArray = BDFDB.ObjectUtils.toArray(category.channels);
					if (channelArray.length) {
						for (let n of channelArray) if ((n.renderLevel == renderLevels.CAN_NOT_SHOW || n._hidden) && e.instance.props.selectedVoiceChannelId != n.record.id) {
							if (show && (this.settings.channels[BDFDB.DiscordConstants.ChannelTypes[n.record.type]] || this.settings.channels[BDFDB.DiscordConstants.ChannelTypes[n.record.type]] === undefined)) {
								n._hidden = true;
								if (e.instance.props.guildChannels.hideMutedChannels && e.instance.props.guildChannels.mutedChannelIds.has(n.record.id)) n.renderLevel = renderLevels.DO_NOT_SHOW;
								else if (category.isCollapsed) n.renderLevel = renderLevels.WOULD_SHOW_IF_UNCOLLAPSED;
								else n.renderLevel = renderLevels.SHOW;
							}
							else {
								delete n._hidden;
								n.renderLevel = renderLevels.CAN_NOT_SHOW;
							}

							if (hiddenChannelCache[e.instance.props.guild.id].indexOf(n.record.id) == -1) hiddenChannelCache[e.instance.props.guild.id].push(n.record.id);
						}
						category.shownChannelIds = channelArray.filter(n => n.renderLevel == renderLevels.SHOW).sort((x, y) => {
							let xPos = x.record.position + (x.record.isGuildVocal() ? 1e4 : 0) + (sortAtBottom && x._hidden ? 1e5 : 0);
							let yPos = y.record.position + (y.record.isGuildVocal() ? 1e4 : 0) + (sortAtBottom && y._hidden ? 1e5 : 0);
							return xPos < yPos ? -1 : xPos > yPos ? 1 : 0;
						}).map(n => n.id);
					}
					else if (insertChannelless && !category.shouldShowEmptyCategory()) {
						let shouldShowEmptyCategory = category.shouldShowEmptyCategory;
						category.shouldShowEmptyCategory = BDFDB.TimeUtils.suppress((...args) => {
							if (!this.started) {
								category.shouldShowEmptyCategory = shouldShowEmptyCategory;
								return false;
							}
							else return this.settings.channels.GUILD_CATEGORY && !blackList.includes(e.instance.props.guild.id);
						}, "Error in shouldShowEmptyCategory of Category Object!");
					}
				};
				processCategory(e.instance.props.guildChannels.favoritesCategory);
				processCategory(e.instance.props.guildChannels.recentsCategory);
				processCategory(e.instance.props.guildChannels.noParentCategory);
				for (let id in e.instance.props.guildChannels.categories) processCategory(e.instance.props.guildChannels.categories[id], true);
			}

			processChannelItem (e) {
				if (e.instance.props.channel && this.isChannelHidden(e.instance.props.channel.id)) {
					if (!e.returnvalue) e.instance.props.className = BDFDB.DOMUtils.formatClassName(e.instance.props.className, ["ShowHiddenChannels", "hiddenChannel"]);
					else {
						let [children, index] = BDFDB.ReactUtils.findParent(e.returnvalue, {name: "ChannelItemIcon"});
						let channelChildren = BDFDB.ReactUtils.findChild(e.returnvalue, {props: [["className", BDFDB.disCN.channelchildren]]});
						if (channelChildren && channelChildren.props && channelChildren.props.children) {
							channelChildren.props.children = [BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, {
								text: BDFDB.LanguageUtils.LanguageStrings.CHANNEL_LOCKED_SHORT,
								children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Clickable, {
									className: BDFDB.disCN.channeliconitem,
									style: {display: "block"},
									children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
										className: BDFDB.disCN.channelactionicon,
										name: BDFDB.LibraryComponents.SvgIcon.Names.LOCK_CLOSED
									})
								})
							})];
						}
						if (!(e.instance.props.channel.type == BDFDB.DiscordConstants.ChannelTypes.GUILD_VOICE && e.instance.props.connected)) {
							let wrapper = BDFDB.ReactUtils.findChild(e.returnvalue, {props: [["className", BDFDB.disCN.channelwrapper]]});
							if (wrapper) {
								wrapper.props.onMouseDown = event => BDFDB.ListenerUtils.stopEvent(event);
								wrapper.props.onMouseUp = event => BDFDB.ListenerUtils.stopEvent(event);
							}
							let mainContent = BDFDB.ReactUtils.findChild(e.returnvalue, {props: [["className", BDFDB.disCN.channelmaincontent]]});
							if (mainContent) {
								mainContent.props.onClick = event => BDFDB.ListenerUtils.stopEvent(event);
								mainContent.props.href = null;
							}
						}
					}
				}
			}

			processVoiceUsers (e) {
				if (!this.settings.general.showVoiceUsers && this.isChannelHidden(e.instance.props.channel.id)) e.instance.props.voiceStates = [];
			}

			isChannelHidden (channelId) {
				let channel = BDFDB.LibraryModules.ChannelStore.getChannel(channelId);
				if (!channel || !channel.guild_id) return false;
				return hiddenChannelCache[channel.guild_id] && hiddenChannelCache[channel.guild_id].indexOf(channelId) > -1;
			}

			batchSetGuilds (settingsPanel, collapseStates, value) {
				if (!value) {
					for (let id of BDFDB.LibraryModules.FolderStore.getFlattenedGuildIds()) blackList.push(id);
					this.saveBlackList(BDFDB.ArrayUtils.removeCopies(blackList));
				}
				else this.saveBlackList([]);
				BDFDB.PluginUtils.refreshSettingsPanel(this, settingsPanel, collapseStates);
			}

			getBlackList () {
				let loadedBlackList = BDFDB.DataUtils.load(this, "blacklist");
				return !BDFDB.ArrayUtils.is(loadedBlackList) ? [] : loadedBlackList;

			}

			saveBlackList (savedBlackList) {
				blackList = savedBlackList;
				BDFDB.DataUtils.save(savedBlackList, this, "blacklist");
			}

			openAccessModal (channel, allowed) {
				let isThread = BDFDB.ChannelUtils.isThread(channel);
				let guild = BDFDB.LibraryModules.GuildStore.getGuild(channel.guild_id);
				let myMember = guild && BDFDB.LibraryModules.MemberStore.getMember(guild.id, BDFDB.UserUtils.me.id);

				let parentChannel = isThread && BDFDB.LibraryModules.ChannelStore.getChannel(BDFDB.LibraryModules.ChannelStore.getChannel(channel.id).parent_id);
				let category = parentChannel && parentChannel.parent_id && BDFDB.LibraryModules.ChannelStore.getChannel(parentChannel.parent_id) || BDFDB.LibraryModules.ChannelStore.getChannel(BDFDB.LibraryModules.ChannelStore.getChannel(channel.id).parent_id);

				let lightTheme = BDFDB.DiscordUtils.getTheme() == BDFDB.disCN.themelight;

				let addUser = (id, users) => {
					let user = BDFDB.LibraryModules.UserStore.getUser(id);
					if (user) users.push(Object.assign({}, user, BDFDB.LibraryModules.MemberStore.getMember(guild.id, id) || {}));
					else users.push({id: id, username: `UserId: ${id}`, fetchable: true});
				};
				let checkAllowPerm = permString => {
					return (permString | BDFDB.DiscordConstants.Permissions.VIEW_CHANNEL) == permString && (channel.type != BDFDB.DiscordConstants.ChannelTypes.GUILD_VOICE || (permString | BDFDB.DiscordConstants.Permissions.CONNECT) == permString);
				};
				let checkDenyPerm = permString => {
					return (permString | BDFDB.DiscordConstants.Permissions.VIEW_CHANNEL) == permString || (channel.type == BDFDB.DiscordConstants.ChannelTypes.GUILD_VOICE && (permString | BDFDB.DiscordConstants.Permissions.CONNECT) == permString);
				};

				let allowedRoles = [], allowedUsers = [], deniedRoles = [], deniedUsers = [], everyoneDenied = false;
				for (let id in channel.permissionOverwrites) {
					if ((channel.permissionOverwrites[id].type == BDFDB.DiscordConstants.PermissionOverrideType.ROLE || overrideTypes[channel.permissionOverwrites[id].type] == BDFDB.DiscordConstants.PermissionOverrideType.ROLE) && (guild.roles[id] && guild.roles[id].name != "@everyone") && checkAllowPerm(channel.permissionOverwrites[id].allow)) {
						allowedRoles.push(Object.assign({overwritten: myMember && myMember.roles.includes(id) && !allowed}, guild.roles[id]));
					}
					else if ((channel.permissionOverwrites[id].type == BDFDB.DiscordConstants.PermissionOverrideType.MEMBER || overrideTypes[channel.permissionOverwrites[id].type] == BDFDB.DiscordConstants.PermissionOverrideType.MEMBER) && checkAllowPerm(channel.permissionOverwrites[id].allow)) {
						addUser(id, allowedUsers);
					}
					if ((channel.permissionOverwrites[id].type == BDFDB.DiscordConstants.PermissionOverrideType.ROLE || overrideTypes[channel.permissionOverwrites[id].type] == BDFDB.DiscordConstants.PermissionOverrideType.ROLE) && checkDenyPerm(channel.permissionOverwrites[id].deny)) {
						deniedRoles.push(guild.roles[id]);
						if (guild.roles[id] && guild.roles[id].name == "@everyone") everyoneDenied = true;
					}
					else if ((channel.permissionOverwrites[id].type == BDFDB.DiscordConstants.PermissionOverrideType.MEMBER || overrideTypes[channel.permissionOverwrites[id].type] == BDFDB.DiscordConstants.PermissionOverrideType.MEMBER) && checkDenyPerm(channel.permissionOverwrites[id].deny)) {
						addUser(id, deniedUsers);
					}
				}

				if (![].concat(allowedUsers, deniedUsers).find(user => user.id == guild.ownerId)) addUser(guild.ownerId, allowedUsers);
				for (let id in guild.roles) if ((guild.roles[id].permissions | BDFDB.DiscordConstants.Permissions.ADMINISTRATOR) == guild.roles[id].permissions && ![].concat(allowedRoles, deniedRoles).find(role => role.id == id)) allowedRoles.push(Object.assign({overwritten: myMember && myMember.roles.includes(id) && !allowed}, guild.roles[id]));
				if (allowed && !everyoneDenied) allowedRoles.push({name: "@everyone"});

				let allowedElements = [], deniedElements = [];
				for (let role of allowedRoles) allowedElements.push(BDFDB.ReactUtils.createElement(RoleRowComponent, {role: role, guildId: guild.id, channelId: channel.id}));
				for (let user of allowedUsers) allowedElements.push(BDFDB.ReactUtils.createElement(UserRowComponent, {user: user, guildId: guild.id, channelId: channel.id}));
				for (let role of deniedRoles) deniedElements.push(BDFDB.ReactUtils.createElement(RoleRowComponent, {role: role, guildId: guild.id, channelId: channel.id}));
				for (let user of deniedUsers) deniedElements.push(BDFDB.ReactUtils.createElement(UserRowComponent, {user: user, guildId: guild.id, channelId: channel.id}));

				const infoStrings = [
					isThread && {
						title: BDFDB.LanguageUtils.LanguageStrings.THREAD_NAME,
						text: channel.name
					}, !isThread && {
						title: BDFDB.LanguageUtils.LanguageStrings.FORM_LABEL_CHANNEL_NAME,
						text: channel.name
					}, channel.type == BDFDB.DiscordConstants.ChannelTypes.GUILD_VOICE ? {
						title: BDFDB.LanguageUtils.LanguageStrings.FORM_LABEL_BITRATE,
						text: channel.bitrate || "---"
					} : {
						title: BDFDB.LanguageUtils.LanguageStrings.FORM_LABEL_CHANNEL_TOPIC,
						text: BDFDB.ReactUtils.markdownParse(channel.topic || "---")
					}, {
						title: BDFDB.LanguageUtils.LanguageStrings.CHANNEL_TYPE,
						text: BDFDB.LanguageUtils.LanguageStrings[typeNameMap[BDFDB.DiscordConstants.ChannelTypes[channel.type]]]
					}, isThread && parentChannel && {
						title: BDFDB.LanguageUtils.LanguageStrings.FORM_LABEL_CHANNEL_NAME,
						text: parentChannel.name
					}, {
						title: BDFDB.LanguageUtils.LanguageStrings.CATEGORY_NAME,
						text: category && category.name || BDFDB.LanguageUtils.LanguageStrings.NO_CATEGORY
					}
				].map((formLabel, i) => formLabel && [
					i == 0 ? null : BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormComponents.FormDivider, {
						className: BDFDB.disCN.marginbottom20
					}),
					BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormComponents.FormItem, {
						title: `${formLabel.title}:`,
						className: BDFDB.DOMUtils.formatClassName(BDFDB.disCN.marginbottom20, i == 0 && BDFDB.disCN.margintop8),
						children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormComponents.FormText, {
							className: BDFDB.disCN.marginleft8,
							children: formLabel.text
						})
					})
				]).flat(10).filter(n => n);

				BDFDB.ModalUtils.open(this, {
					size: "MEDIUM",
					header: BDFDB.LanguageUtils.LanguageStrings.CHANNEL + " " + BDFDB.LanguageUtils.LanguageStrings.ACCESSIBILITY,
					subHeader: "#" + channel.name,
					className: ["ShowHiddenChannels", "accessModal"],
					contentClassName: BDFDB.DOMUtils.formatClassName(!isThread && BDFDB.disCN.listscroller),
					onOpen: modalInstance => {if (modalInstance) accessModal = modalInstance;},
					children: isThread ? infoStrings : [
						BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ModalComponents.ModalTabContent, {
							className: BDFDB.disCN.modalsubinner,
							tab: BDFDB.LanguageUtils.LanguageStrings.OVERLAY_SETTINGS_GENERAL_TAB,
							children: infoStrings
						}),
						BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ModalComponents.ModalTabContent, {
							tab: this.labels.modal_allowed,
							children: allowedElements.length ? allowedElements :
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.MessagesPopoutComponents.EmptyStateBottom, {
									msg: BDFDB.LanguageUtils.LanguageStrings.AUTOCOMPLETE_NO_RESULTS_HEADER,
									image: lightTheme ? "/assets/9b0d90147f7fab54f00dd193fe7f85cd.svg" : "/assets/308e587f3a68412f137f7317206e92c2.svg"
								})
						}),
						BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ModalComponents.ModalTabContent, {
							tab: this.labels.modal_denied,
							children: deniedElements.length ? deniedElements :
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.MessagesPopoutComponents.EmptyStateBottom, {
									msg: BDFDB.LanguageUtils.LanguageStrings.AUTOCOMPLETE_NO_RESULTS_HEADER,
									image: lightTheme ? "/assets/9b0d90147f7fab54f00dd193fe7f85cd.svg" : "/assets/308e587f3a68412f137f7317206e92c2.svg"
								})
						})
					]
				});
			}

			setLabelsByLanguage () {
				switch (BDFDB.LanguageUtils.getLanguage().id) {
					case "bg":		// Bulgarian
						return {
							context_changeorder:				"?????????????? ???? ???????? ???? ???????????????? ????????????",
							context_changeorder_bottom:			"?????????? ?????????????????? ?? ?????????????? ????????",
							context_changeorder_native:			"?????????? ?????????????????? ?? ???????????????? ??????",
							context_channelaccess:				"???????????? ???? ??????????",
							context_hidehidden:					"???????????????? ???? ?????????????????????? ????????????",
							modal_allowed:						"??????????????????",
							modal_denied:						"???????????? ????"
						};
					case "cs":		// Czech
						return {
							context_changeorder:				"Zm??nit po??ad?? skryt??ch kan??l??",
							context_changeorder_bottom:			"Nativn?? kategorie dole",
							context_changeorder_native:			"Nativn?? kategorie ve spr??vn??m po??ad??",
							context_channelaccess:				"P????stup ke kan??lu",
							context_hidehidden:					"Skr??t zam??en?? kan??ly",
							modal_allowed:						"Povoleno",
							modal_denied:						"Odep??eno"
						};
					case "da":		// Danish
						return {
							context_changeorder:				"Skift r??kkef??lge for skjulte kanaler",
							context_changeorder_bottom:			"Indf??dt kategori i bunden",
							context_changeorder_native:			"Native Kategori i korrekt r??kkef??lge",
							context_channelaccess:				"Kanaltilgang",
							context_hidehidden:					"Skjul l??ste kanaler",
							modal_allowed:						"Tilladt",
							modal_denied:						"N??gtet"
						};
					case "de":		// German
						return {
							context_changeorder:				"Reihenfolge der versteckten Kan??le ??ndern",
							context_changeorder_bottom:			"Native Kategorie ganz unten",
							context_changeorder_native:			"Native Kategorie in der richtigen Reihenfolge",
							context_channelaccess:				"Kanalzugriff",
							context_hidehidden:					"Versteckte Kan??le ausblenden",
							modal_allowed:						"Erlaubt",
							modal_denied:						"Verweigert"
						};
					case "el":		// Greek
						return {
							context_changeorder:				"???????????? ???????????? ???????????? ????????????????",
							context_changeorder_bottom:			"?????????????? ?????????????????? ?????? ???????? ??????????",
							context_changeorder_native:			"?????????????? ?????????????????? ???? ?????????? ??????????",
							context_channelaccess:				"???????????????? ????????????????",
							context_hidehidden:					"???????????????? ?????????????????????? ????????????????",
							modal_allowed:						"????????????????????????",
							modal_denied:						"??????????????????????"
						};
					case "es":		// Spanish
						return {
							context_changeorder:				"Cambiar el orden de los canales ocultos",
							context_changeorder_bottom:			"Categor??a nativa en la parte inferior",
							context_changeorder_native:			"Categor??a nativa en el orden correcto",
							context_channelaccess:				"Acceso al canal",
							context_hidehidden:					"Ocultar canales bloqueados",
							modal_allowed:						"Permitido",
							modal_denied:						"Negado"
						};
					case "fi":		// Finnish
						return {
							context_changeorder:				"Muuta piilotettujen kanavien j??rjestyst??",
							context_changeorder_bottom:			"Alkuper??inen luokka alareunassa",
							context_changeorder_native:			"Alkuper??inen luokka oikeassa j??rjestyksess??",
							context_channelaccess:				"Kanavan k??ytt??oikeus",
							context_hidehidden:					"Piilota lukitut kanavat",
							modal_allowed:						"Sallittu",
							modal_denied:						"Kielletty"
						};
					case "fr":		// French
						return {
							context_changeorder:				"Modifier l'ordre des canaux cach??s",
							context_changeorder_bottom:			"Cat??gorie native en bas",
							context_changeorder_native:			"Cat??gorie native dans le bon ordre",
							context_channelaccess:				"Acc??s ?? la cha??ne",
							context_hidehidden:					"Masquer les salons verrouill??es",
							modal_allowed:						"Permis",
							modal_denied:						"Refus??"
						};
					case "hi":		// Hindi
						return {
							context_changeorder:				"???????????? ???????????? ??????????????? ???????????????",
							context_changeorder_bottom:			"???????????? ?????? ?????? ????????? ??????????????????",
							context_changeorder_native:			"????????? ?????????????????? ????????? ???????????? ?????????",
							context_channelaccess:				"???????????? ??????????????????",
							context_hidehidden:					"????????? ???????????? ?????????????????? Hide",
							modal_allowed:						"?????????????????? ??????",
							modal_denied:						"???????????????"
						};
					case "hr":		// Croatian
						return {
							context_changeorder:				"Promijenite redoslijed skrivenih kanala",
							context_changeorder_bottom:			"Izvorna kategorija na dnu",
							context_changeorder_native:			"Izvorna kategorija u ispravnom redoslijedu",
							context_channelaccess:				"Pristup kanalu",
							context_hidehidden:					"Sakrij zaklju??ane kanale",
							modal_allowed:						"Dopu??tena",
							modal_denied:						"Odbijen"
						};
					case "hu":		// Hungarian
						return {
							context_changeorder:				"Rejtett csatorn??k sorrendj??nek m??dos??t??sa",
							context_changeorder_bottom:			"Nat??v kateg??ria az alj??n",
							context_changeorder_native:			"Nat??v kateg??ria helyes sorrendben",
							context_channelaccess:				"Csatorn??hoz val?? hozz??f??r??s",
							context_hidehidden:					"Z??rt csatorn??k elrejt??se",
							modal_allowed:						"Megengedett",
							modal_denied:						"Megtagadva"
						};
					case "it":		// Italian
						return {
							context_changeorder:				"Modifica l'ordine dei canali nascosti",
							context_changeorder_bottom:			"Categoria nativa in basso",
							context_changeorder_native:			"Categoria nativa nell'ordine corretto",
							context_channelaccess:				"Accesso al canale",
							context_hidehidden:					"Nascondi canali bloccati",
							modal_allowed:						"Consentito",
							modal_denied:						"Negato"
						};
					case "ja":		// Japanese
						return {
							context_changeorder:				"?????????????????????????????????????????????",
							context_changeorder_bottom:			"????????????????????????????????????",
							context_changeorder_native:			"?????????????????????????????????????????????",
							context_channelaccess:				"????????????????????????",
							context_hidehidden:					"??????????????????????????????????????????????????????",
							modal_allowed:						"??????",
							modal_denied:						"?????????????????????"
						};
					case "ko":		// Korean
						return {
							context_changeorder:				"????????? ?????? ?????? ??????",
							context_changeorder_bottom:			"????????? ?????? ????????????",
							context_changeorder_native:			"????????? ????????? ???????????? ????????????",
							context_channelaccess:				"?????? ?????????",
							context_hidehidden:					"?????? ?????? ?????????",
							modal_allowed:						"?????????",
							modal_denied:						"?????? ???"
						};
					case "lt":		// Lithuanian
						return {
							context_changeorder:				"Keisti pasl??pt?? kanal?? tvark??",
							context_changeorder_bottom:			"Gimtoji kategorija apa??ioje",
							context_changeorder_native:			"Gimtoji kategorija teisinga tvarka",
							context_channelaccess:				"Prieiga prie kanalo",
							context_hidehidden:					"Sl??pti u??rakintus kanalus",
							modal_allowed:						"Leid??iama",
							modal_denied:						"Paneigta"
						};
					case "nl":		// Dutch
						return {
							context_changeorder:				"Wijzig de volgorde van verborgen kanalen",
							context_changeorder_bottom:			"Native categorie onderaan",
							context_changeorder_native:			"Native categorie in de juiste volgorde",
							context_channelaccess:				"Kanaaltoegang",
							context_hidehidden:					"Verberg vergrendelde kanalen",
							modal_allowed:						"Toegestaan",
							modal_denied:						"Geweigerd"
						};
					case "no":		// Norwegian
						return {
							context_changeorder:				"Endre rekkef??lgen p?? skjulte kanaler",
							context_changeorder_bottom:			"Innf??dt kategori nederst",
							context_changeorder_native:			"Innf??dt kategori i riktig rekkef??lge",
							context_channelaccess:				"Kanaltilgang",
							context_hidehidden:					"Skjul l??ste kanaler",
							modal_allowed:						"Tillatt",
							modal_denied:						"Nektet"
						};
					case "pl":		// Polish
						return {
							context_changeorder:				"Zmie?? kolejno???? ukrytych kana????w",
							context_changeorder_bottom:			"Kategoria natywna na dole",
							context_changeorder_native:			"Kategoria natywna we w??a??ciwej kolejno??ci",
							context_channelaccess:				"Dost??p do kana????w",
							context_hidehidden:					"Ukryj zablokowane kana??y",
							modal_allowed:						"Dozwolony",
							modal_denied:						"Odm??wiono"
						};
					case "pt-BR":	// Portuguese (Brazil)
						return {
							context_changeorder:				"Alterar a ordem dos canais ocultos",
							context_changeorder_bottom:			"Categoria nativa na parte inferior",
							context_changeorder_native:			"Categoria nativa na ordem correta",
							context_channelaccess:				"Acesso ao canal",
							context_hidehidden:					"Ocultar canais bloqueados",
							modal_allowed:						"Permitido",
							modal_denied:						"Negado"
						};
					case "ro":		// Romanian
						return {
							context_changeorder:				"Schimba??i comanda canalelor ascunse",
							context_changeorder_bottom:			"Categorie nativ?? ??n partea de jos",
							context_changeorder_native:			"Categorie nativ?? ??n ordine corect??",
							context_channelaccess:				"Acces la canal",
							context_hidehidden:					"Ascunde??i canalele blocate",
							modal_allowed:						"Permis",
							modal_denied:						"Negat"
						};
					case "ru":		// Russian
						return {
							context_changeorder:				"???????????????? ?????????????? ?????????????? ??????????????",
							context_changeorder_bottom:			"???????????? ?????????????????? ??????????",
							context_changeorder_native:			"?????????????????????? ?????????????????? ?? ???????????????????? ??????????????",
							context_channelaccess:				"???????????? ?? ????????????",
							context_hidehidden:					"???????????? ?????????????????????????????? ????????????",
							modal_allowed:						"??????????????????????",
							modal_denied:						"????????????????"
						};
					case "sv":		// Swedish
						return {
							context_changeorder:				"??ndra ordning f??r dolda kanaler",
							context_changeorder_bottom:			"Naturlig kategori l??ngst ner",
							context_changeorder_native:			"Naturlig kategori i r??tt ordning",
							context_channelaccess:				"Kanaltillg??ng",
							context_hidehidden:					"D??lj l??sta kanaler",
							modal_allowed:						"Till??tet",
							modal_denied:						"F??rnekad"
						};
					case "th":		// Thai
						return {
							context_changeorder:				"?????????????????????????????????????????????????????????????????????????????????",
							context_changeorder_bottom:			"?????????????????????????????????????????????????????????????????????????????????",
							context_changeorder_native:			"???????????????????????????????????????????????????????????????????????????????????????????????????",
							context_channelaccess:				"??????????????????????????????????????????",
							context_hidehidden:					"??????????????????????????????????????????????????????",
							modal_allowed:						"????????????????????????????????????",
							modal_denied:						"???????????????????????????"
						};
					case "tr":		// Turkish
						return {
							context_changeorder:				"Gizli Kanal S??ras??n?? De??i??tir",
							context_changeorder_bottom:			"Altta Yerel Kategori",
							context_changeorder_native:			"Yerel Kategori do??ru s??rada",
							context_channelaccess:				"Kanal Eri??imi",
							context_hidehidden:					"Kilitli Kanallar?? Gizle",
							modal_allowed:						"??zin veriliyor",
							modal_denied:						"Reddedildi"
						};
					case "uk":		// Ukrainian
						return {
							context_changeorder:				"?????????????? ?????????????? ???????????????????? ??????????????",
							context_changeorder_bottom:			"?????????? ?????????????????? ??????????",
							context_changeorder_native:			"?????????? ?????????????????? ?? ?????????????????????? ??????????????",
							context_channelaccess:				"???????????? ???? ????????????",
							context_hidehidden:					"?????????????? ?????????????????????? ????????????",
							modal_allowed:						"??????????????????",
							modal_denied:						"??????????????????????????"
						};
					case "vi":		// Vietnamese
						return {
							context_changeorder:				"Thay ?????i th??? t??? c??c k??nh b??? ???n",
							context_changeorder_bottom:			"Danh m???c G???c ??? d?????i c??ng",
							context_changeorder_native:			"Danh m???c g???c theo ????ng th??? t???",
							context_channelaccess:				"Quy???n truy c???p k??nh",
							context_hidehidden:					"???n c??c k??nh ???? kh??a",
							modal_allowed:						"???????c ph??p",
							modal_denied:						"Ph??? ?????nh"
						};
					case "zh-CN":	// Chinese (China)
						return {
							context_changeorder:				"????????????????????????",
							context_changeorder_bottom:			"?????????????????????",
							context_changeorder_native:			"???????????????????????????",
							context_channelaccess:				"????????????",
							context_hidehidden:					"?????????????????????",
							modal_allowed:						"?????????",
							modal_denied:						"?????????"
						};
					case "zh-TW":	// Chinese (Taiwan)
						return {
							context_changeorder:				"????????????????????????",
							context_changeorder_bottom:			"?????????????????????",
							context_changeorder_native:			"???????????????????????????",
							context_channelaccess:				"????????????",
							context_hidehidden:					"?????????????????????",
							modal_allowed:						"?????????",
							modal_denied:						"?????????"
						};
					default:		// English
						return {
							context_changeorder:				"Change Hidden Channels Order",
							context_changeorder_bottom:			"Native Category at the bottom",
							context_changeorder_native:			"Native Category in correct Order",
							context_channelaccess:				"Channel Access",
							context_hidehidden:					"Hide Locked Channels",
							modal_allowed:						"Permitted",
							modal_denied:						"Denied"
						};
				}
			}
		};
	})(window.BDFDB_Global.PluginUtils.buildPlugin(changeLog));
})();
