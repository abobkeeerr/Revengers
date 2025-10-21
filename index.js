require("dotenv").config();
// ✔️ ممتاز

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  RoleSelectMenuBuilder,
  PermissionFlagsBits,
  ChannelSelectMenuBuilder,
} = require("discord.js");
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require("fs");
const path = require("path");

// تهيئة العميل
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// تحميل الإعدادات
let config;
try {
  config = JSON.parse(
    readFileSync(path.join(__dirname, "config.json"), "utf8"),
  );
} catch (error) {
  console.error("❌ خطأ في تحميل ملف الإعدادات:", error.message);
  process.exit(1);
}

// مسار قاعدة البيانات
const dbPath = path.join(__dirname, "database", "welcome.json");

// ضمان وجود مجلد database
if (!existsSync(path.join(__dirname, "database"))) {
  mkdirSync(path.join(__dirname, "database"));
}

// قراءة البيانات من قاعدة البيانات مع معالجة الأخطاء
function readData() {
  try {
    if (!existsSync(dbPath)) {
      // إنشاء بيانات افتراضية إذا لم يكن الملف موجودًا
      const initialData = {
        title: "مرحباً بك في {server.name}!",
        message:
          "أهلاً {user.mention} في {server.name}! نحن الآن {member.count} أعضاء.",
        banner: "",
        thumbnail: "",
        channel: "",
        role: "",
        enabled: false,
        dm: false,
        logs: [],
        color: "#0099FF",
      };
      writeFileSync(dbPath, JSON.stringify(initialData, null, 2));
      return initialData;
    }

    const data = readFileSync(dbPath, "utf8");
    if (!data.trim()) {
      throw new Error("ملف قاعدة البيانات فارغ");
    }

    const parsed = JSON.parse(data);

    // ضمان أن logs موجودة كـ Array
    if (!Array.isArray(parsed.logs)) {
      parsed.logs = [];
    }

    return parsed;
  } catch (error) {
    console.error("❌ خطأ في قراءة قاعدة البيانات:", error.message);
    // إنشاء بيانات افتراضية في حالة الخطأ
    const initialData = {
      title: "مرحباً بك في {server.name}!",
      message:
        "أهلاً {user.mention} في {server.name}! نحن الآن {member.count} أعضاء.",
      banner: "",
      thumbnail: "",
      channel: "",
      role: "",
      enabled: false,
      dm: false,
      logs: [],
      color: "#0099FF",
    };
    writeFileSync(dbPath, JSON.stringify(initialData, null, 2));
    return initialData;
  }
}

// كتابة البيانات إلى قاعدة البيانات
function writeData(data) {
  try {
    writeFileSync(dbPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("❌ خطأ في كتابة قاعدة البيانات:", error.message);
  }
}

// إضافة سجل
function addLog(action, userId) {
  const data = readData();
  data.logs.push({
    action,
    userId,
    timestamp: new Date().toISOString(),
  });
  // الحفاظ على آخر 50 سجل فقط
  if (data.logs.length > 50) {
    data.logs = data.logs.slice(-50);
  }
  writeData(data);
}

// التحقق من الصلاحيات الموسعة
async function checkPermissions(interaction) {
  if (interaction.user.id === config.adminId) return true;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

// التحقق من صحة الروابط
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// معالجة النص واستبدال المتغيرات
function processText(text, user, guild) {
  if (!text) return "";
  return text
    .replace(/{user.mention}/g, `<@${user.id}>`)
    .replace(/{user.name}/g, user.username)
    .replace(/{user.tag}/g, user.tag)
    .replace(/{server.name}/g, guild.name)
    .replace(/{member.count}/g, guild.memberCount.toString());
}

// تحويل اللون من HEX إلى عدد
function hexToInt(hexColor) {
  if (!hexColor) return 0x0099ff;
  try {
    return parseInt(hexColor.replace("#", ""), 16);
  } catch (error) {
    return 0x0099ff;
  }
}

// إنشاء لوحة التحكم
function createControlPanel(page = "main") {
  const data = readData();

  // تحويل اللون من HEX إلى عدد
  const color = hexToInt(data.color);

  if (page === "logs") {
    // إنشاء واجهة سجلات النظام
    const logsEmbed = new EmbedBuilder()
      .setTitle("📜 سجل التعديلات - الصفحة 1")
      .setColor(color);

    const recentLogs = Array.isArray(data.logs)
      ? data.logs.slice(-10).reverse()
      : [];
    if (recentLogs.length === 0) {
      logsEmbed.setDescription("لا يوجد سجلات حتى الآن");
    } else {
      let logsDescription = "";
      for (let i = 0; i < Math.min(recentLogs.length, 10); i++) {
        const log = recentLogs[i];
        const date = new Date(log.timestamp).toLocaleString("ar-SA");
        logsDescription += `**${i + 1}.** ${date} - ${log.action}\n`;
      }
      logsEmbed.setDescription(logsDescription);
    }

    return {
      embeds: [logsEmbed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("logs_prev")
            .setLabel("السابق")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId("logs_next")
            .setLabel("التالي")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(data.logs.length <= 10),
          new ButtonBuilder()
            .setCustomId("back_main")
            .setLabel("العودة للرئيسية")
            .setStyle(ButtonStyle.Primary),
        ),
      ],
    };
  }

  // الصفحة الرئيسية
  const embed = new EmbedBuilder()
    .setTitle("لوحة التحكم: إعدادات الترحيب")
    .setDescription(
      "استخدم الأزرار أدناه لتخصيص رسالة الترحيب. سيتم إرسال هذه الرسالة تلقائياً عندما ينضم عضو جديد إلى السيرفر",
    )
    .setColor(color);

  if (data.thumbnail && isValidUrl(data.thumbnail))
    embed.setThumbnail(data.thumbnail);
  if (data.banner && isValidUrl(data.banner)) embed.setImage(data.banner);

  embed
    .addFields(
      {
        name: "الحالة",
        value: data.enabled ? "✅ مفعل" : "❌ معطل",
        inline: true,
      },
      {
        name: "القناة",
        value: data.channel ? `<#${data.channel}>` : "❌ غير محددة",
        inline: true,
      },
      {
        name: "الرتبة التلقائية",
        value: data.role ? `<@&${data.role}>` : "❌ غير محددة",
        inline: true,
      },
      {
        name: "الرسالة الخاصة",
        value: data.dm ? "✅ مفعلة" : "❌ معطلة",
        inline: true,
      },
      { name: "لون الرسالة", value: data.color || "#0099FF", inline: true },
    )
    .setTimestamp()
    .setFooter({ text: "نظام الترحيب - إعدادات التحكم" });

  return {
    embeds: [embed],
    components: createControlButtons(),
  };
}

// إنشاء أزرار التحكم
function createControlButtons() {
  const data = readData();

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("set_welcome")
        .setLabel("📝 ضبط الترحيب")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("set_channel")
        .setLabel("📍 تحديد القناة")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("show_variables")
        .setLabel("💡 شرح المتغيرات")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("set_color")
        .setLabel("🎨 تغيير اللون")
        .setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("set_role")
        .setLabel("🎭 منح رتبة تلقائية")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("preview")
        .setLabel("👀 معاينة الرسالة")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("toggle_dm")
        .setLabel(
          data.dm ? "📩 إيقاف الرسائل الخاصة" : "📩 تفعيل الرسائل الخاصة",
        )
        .setStyle(data.dm ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("show_logs")
        .setLabel("📜 سجل الإعدادات")
        .setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("enable")
        .setLabel("✅ تفعيل النظام")
        .setStyle(ButtonStyle.Success)
        .setDisabled(data.enabled),
      new ButtonBuilder()
        .setCustomId("disable")
        .setLabel("❌ تعطيل النظام")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!data.enabled),
      new ButtonBuilder()
        .setCustomId("quick_setup")
        .setLabel("⚡ الإعداد السريع")
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

// تحديث رسالة لوحة التحكم
async function updateControlPanel(interaction, page = "main") {
  const panel = createControlPanel(page);
  await interaction.editReply(panel);
}

// معالجة الأوامر
client.on("interactionCreate", async (interaction) => {
  // معالجة أمر النظام الأساسي
  if (
    interaction.isChatInputCommand() &&
    interaction.commandName === "welcome"
  ) {
    if (!(await checkPermissions(interaction))) {
      return interaction.reply({
        content: "ليس لديك صلاحية استخدام هذا الأمر",
        ephemeral: true,
      });
    }

    await interaction.reply(createControlPanel());
  }

  // معالجة النقر على الأزرار
  if (interaction.isButton()) {
    if (!(await checkPermissions(interaction))) {
      return interaction.reply({
        content: "ليس لديك صلاحية استخدام هذا الأمر",
        ephemeral: true,
      });
    }

    const data = readData();

    // الأزرار التي تتطلب إظهار مودال لا يجب تأجيلها
    const modalButtons = ["set_welcome", "set_color", "quick_setup"];

    if (modalButtons.includes(interaction.customId)) {
      // معالجة الأزرار التي تفتح مودال مباشرة
      switch (interaction.customId) {
        case "set_welcome":
          // إنشاء نموذج ضبط الترحيب
          const modal = new ModalBuilder()
            .setCustomId("welcome_modal")
            .setTitle("إعدادات رسالة الترحيب");

          const titleInput = new TextInputBuilder()
            .setCustomId("title_input")
            .setLabel("عنوان الترحيب")
            .setStyle(TextInputStyle.Short)
            .setValue(data.title || "")
            .setRequired(false);

          const messageInput = new TextInputBuilder()
            .setCustomId("message_input")
            .setLabel("رسالة الترحيب")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(data.message || "")
            .setRequired(true);

          const bannerInput = new TextInputBuilder()
            .setCustomId("banner_input")
            .setLabel("رابط صورة البانر (اختياري)")
            .setStyle(TextInputStyle.Short)
            .setValue(data.banner || "")
            .setRequired(false);

          const thumbnailInput = new TextInputBuilder()
            .setCustomId("thumbnail_input")
            .setLabel("رابط صورة الثمبنيل (اختياري)")
            .setStyle(TextInputStyle.Short)
            .setValue(data.thumbnail || "")
            .setRequired(false);

          const firstActionRow = new ActionRowBuilder().addComponents(
            titleInput,
          );
          const secondActionRow = new ActionRowBuilder().addComponents(
            messageInput,
          );
          const thirdActionRow = new ActionRowBuilder().addComponents(
            bannerInput,
          );
          const fourthActionRow = new ActionRowBuilder().addComponents(
            thumbnailInput,
          );

          modal.addComponents(
            firstActionRow,
            secondActionRow,
            thirdActionRow,
            fourthActionRow,
          );

          await interaction.showModal(modal);
          break;

        case "set_color":
          // تغيير لون الرسالة
          const colorModal = new ModalBuilder()
            .setCustomId("color_modal")
            .setTitle("تغيير لون رسالة الترحيب");

          const colorInput = new TextInputBuilder()
            .setCustomId("color_input")
            .setLabel("أدخل اللون بصيغة HEX (مثل: #0099FF)")
            .setStyle(TextInputStyle.Short)
            .setValue(data.color || "#0099FF")
            .setRequired(true)
            .setMaxLength(7);

          const colorActionRow = new ActionRowBuilder().addComponents(
            colorInput,
          );
          colorModal.addComponents(colorActionRow);

          await interaction.showModal(colorModal);
          break;

        case "quick_setup":
          // الإعداد السريع للنظام
          const setupModal = new ModalBuilder()
            .setCustomId("setup_modal")
            .setTitle("الإعداد السريع لنظام الترحيب");

          const channelIdInput = new TextInputBuilder()
            .setCustomId("channel_id")
            .setLabel("معرف قناة الترحيب")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("123456789012345678")
            .setRequired(true);

          const welcomeMsgInput = new TextInputBuilder()
            .setCustomId("welcome_msg")
            .setLabel("رسالة الترحيب")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(data.message || "أهلاً {user.mention} في {server.name}!")
            .setRequired(true);

          const firstRow = new ActionRowBuilder().addComponents(channelIdInput);
          const secondRow = new ActionRowBuilder().addComponents(
            welcomeMsgInput,
          );

          setupModal.addComponents(firstRow, secondRow);

          await interaction.showModal(setupModal);
          break;
      }
    } else {
      // الأزرار الأخرى التي لا تفتح مودال يمكن تأجيلها
      await interaction.deferUpdate();

      switch (interaction.customId) {
        case "set_channel":
          // استخدام ChannelSelectMenu بدلاً من StringSelectMenu
          const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId("channel_select")
            .setPlaceholder("اختر قناة الترحيب")
            .setChannelTypes([ChannelType.GuildText]);

          await interaction.followUp({
            content: "اختر القناة التي سيتم إرسال رسائل الترحيب فيها:",
            components: [new ActionRowBuilder().addComponents(channelSelect)],
            ephemeral: true,
          });
          break;

        case "show_variables":
          // عرض شرح المتغيرات
          const variablesEmbed = new EmbedBuilder()
            .setTitle("💡 المتغيرات المتاحة")
            .setDescription("يمكنك استخدام هذه المتغيرات في رسالة الترحيب:")
            .addFields(
              {
                name: "{user.mention}",
                value: "منشن العضو الجديد",
                inline: true,
              },
              { name: "{user.name}", value: "اسم العضو", inline: true },
              { name: "{user.tag}", value: "اسم العضو كامل", inline: true },
              { name: "{server.name}", value: "اسم السيرفر", inline: true },
              { name: "{member.count}", value: "عدد الأعضاء", inline: true },
            )
            .setColor(hexToInt(data.color));

          await interaction.followUp({
            embeds: [variablesEmbed],
            ephemeral: true,
          });
          break;

        case "set_role":
          // قائمة اختيار الرتب
          const roleSelect = new RoleSelectMenuBuilder()
            .setCustomId("role_select")
            .setPlaceholder("اختر رتبة التلقائية");

          await interaction.followUp({
            content: "اختر الرتبة التي سيتم منحها تلقائياً للأعضاء الجدد:",
            components: [new ActionRowBuilder().addComponents(roleSelect)],
            ephemeral: true,
          });
          break;

        case "preview":
          // معاينة رسالة الترحيب مع تحسينات
          const previewEmbed = new EmbedBuilder()
            .setTitle(
              processText(
                data.title || "مرحباً بك!",
                interaction.user,
                interaction.guild,
              ),
            )
            .setDescription(
              processText(
                data.message || "أهلاً بك في السيرفر!",
                interaction.user,
                interaction.guild,
              ),
            )
            .setColor(hexToInt(data.color));

          if (data.thumbnail && isValidUrl(data.thumbnail))
            previewEmbed.setThumbnail(data.thumbnail);
          if (data.banner && isValidUrl(data.banner))
            previewEmbed.setImage(data.banner);

          // إضافة معلومات إضافية للمعاينة
          previewEmbed.addFields(
            {
              name: "القناة",
              value: data.channel ? `<#${data.channel}>` : "❌ غير محددة",
              inline: true,
            },
            {
              name: "الرتبة",
              value: data.role ? `<@&${data.role}>` : "❌ غير محددة",
              inline: true,
            },
            {
              name: "الرسائل الخاصة",
              value: data.dm ? "✅ مفعلة" : "❌ معطلة",
              inline: true,
            },
          );

          await interaction.followUp({
            content: "**👀 معاينة رسالة الترحيب:**",
            embeds: [previewEmbed],
            ephemeral: true,
          });
          break;

        case "toggle_dm":
          // تبديل إرسال الرسائل الخاصة
          data.dm = !data.dm;
          writeData(data);
          addLog(
            `تبديل إرسال الرسائل الخاصة إلى: ${data.dm ? "مفعل" : "معطل"}`,
            interaction.user.id,
          );

          await interaction.followUp({
            content: `تم ${data.dm ? "تفعيل" : "تعطيل"} إرسال الرسائل الخاصة`,
            ephemeral: true,
          });

          // تحديث لوحة التحكم
          await updateControlPanel(interaction);
          break;

        case "show_logs":
          // عرض سجل الإعدادات بنظام الصفحات
          await updateControlPanel(interaction, "logs");
          break;

        case "logs_prev":
        case "logs_next":
        case "back_main":
          // التنقل بين الصفحات
          await updateControlPanel(
            interaction,
            interaction.customId === "back_main" ? "main" : "logs",
          );
          break;

        case "enable":
          // تفعيل النظام
          data.enabled = true;
          writeData(data);
          addLog("تفعيل نظام الترحيب", interaction.user.id);

          await interaction.followUp({
            content: "تم تفعيل نظام الترحيب",
            ephemeral: true,
          });

          // تحديث لوحة التحكم
          await updateControlPanel(interaction);
          break;

        case "disable":
          // تعطيل النظام
          data.enabled = false;
          writeData(data);
          addLog("تعطيل نظام الترحيب", interaction.user.id);

          await interaction.followUp({
            content: "تم تعطيل نظام الترحيب",
            ephemeral: true,
          });

          // تحديث لوحة التحكم
          await updateControlPanel(interaction);
          break;
      }
    }
  }

  // معالجة النماذج (Modals)
  if (interaction.isModalSubmit()) {
    if (interaction.customId === "welcome_modal") {
      const data = readData();

      data.title = interaction.fields.getTextInputValue("title_input");
      data.message = interaction.fields.getTextInputValue("message_input");

      // التحقق من صحة الروابط قبل حفظها
      const bannerUrl = interaction.fields.getTextInputValue("banner_input");
      const thumbnailUrl =
        interaction.fields.getTextInputValue("thumbnail_input");

      data.banner = bannerUrl && isValidUrl(bannerUrl) ? bannerUrl : "";
      data.thumbnail =
        thumbnailUrl && isValidUrl(thumbnailUrl) ? thumbnailUrl : "";

      writeData(data);
      addLog("تعديل إعدادات رسالة الترحيب", interaction.user.id);

      await interaction.reply({
        content: "تم حفظ إعدادات الترحيب بنجاح",
        ephemeral: true,
      });
    }

    if (interaction.customId === "color_modal") {
      const data = readData();
      const colorInput = interaction.fields.getTextInputValue("color_input");

      // التحقق من صيغة اللون
      if (/^#([0-9A-F]{3}){1,2}$/i.test(colorInput)) {
        data.color = colorInput;
        writeData(data);
        addLog(`تغيير لون الرسالة إلى: ${colorInput}`, interaction.user.id);

        await interaction.reply({
          content: `تم تغيير لون الرسالة إلى \`${colorInput}\``,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "صيغة اللون غير صحيحة. يجب أن تكون بصيغة HEX (مثل: #0099FF)",
          ephemeral: true,
        });
      }
    }

    if (interaction.customId === "setup_modal") {
      const data = readData();
      const channelId = interaction.fields.getTextInputValue("channel_id");
      const welcomeMsg = interaction.fields.getTextInputValue("welcome_msg");

      // التحقق من وجود القناة
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel) {
        return interaction.reply({
          content: "معرف القناة غير صحيح أو القناة غير موجودة",
          ephemeral: true,
        });
      }

      data.channel = channelId;
      data.message = welcomeMsg;
      data.enabled = true;

      writeData(data);
      addLog("الإعداد السريع لنظام الترحيب", interaction.user.id);

      await interaction.reply({
        content: `تم الإعداد السريع بنجاح! النظام مفعل الآن ورسائل الترحيب ستُرسل في <#${channelId}>`,
        ephemeral: true,
      });
    }
  }

  // معالجة قوائم الاختيار
  if (interaction.isChannelSelectMenu()) {
    if (interaction.customId === "channel_select") {
      // تأجيل الرد لتجنب الخطأ
      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate();
      }

      const data = readData();
      data.channel = interaction.values[0];
      writeData(data);
      addLog(
        `تعيين قناة الترحيب إلى: ${interaction.values[0]}`,
        interaction.user.id,
      );

      await interaction.followUp({
        content: `تم تعيين قناة الترحيب إلى <#${interaction.values[0]}>`,
        ephemeral: true,
      });
    }
  }

  // معالجة اختيار الرتب
  if (interaction.isRoleSelectMenu()) {
    if (interaction.customId === "role_select") {
      // تأجيل الرد لتجنب الخطأ
      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate();
      }

      const data = readData();
      data.role = interaction.values[0];
      writeData(data);
      addLog(
        `تعيين الرتبة التلقائية إلى: ${interaction.values[0]}`,
        interaction.user.id,
      );

      await interaction.followUp({
        content: `تم تعيين الرتبة التلقائية إلى <@&${interaction.values[0]}>`,
        ephemeral: true,
      });
    }
  }
});

// معالجة دخول الأعضاء الجدد
client.on("guildMemberAdd", async (member) => {
  const data = readData();

  if (!data.enabled) return;

  // إرسال رسالة الترحيب في القناة المحددة
  if (data.channel) {
    const channel = member.guild.channels.cache.get(data.channel);
    if (channel) {
      const welcomeEmbed = new EmbedBuilder()
        .setTitle(processText(data.title, member.user, member.guild))
        .setDescription(processText(data.message, member.user, member.guild))
        .setColor(hexToInt(data.color));

      if (data.thumbnail && isValidUrl(data.thumbnail))
        welcomeEmbed.setThumbnail(data.thumbnail);
      if (data.banner && isValidUrl(data.banner))
        welcomeEmbed.setImage(data.banner);

      try {
        await channel.send({ embeds: [welcomeEmbed] });
        addLog(
          `تم إرسال رسالة ترحيب للعضو: ${member.user.tag}`,
          client.user.id,
        );
      } catch (error) {
        console.error("فشل في إرسال رسالة الترحيب:", error.message);
        addLog(
          `فشل في إرسال رسالة ترحيب للعضو: ${member.user.tag}`,
          client.user.id,
        );
      }
    }
  }

  // منح الرتبة التلقائية
  if (data.role) {
    try {
      await member.roles.add(data.role);
      addLog(
        `تم منح الرتبة تلقائياً للعضو: ${member.user.tag}`,
        client.user.id,
      );
    } catch (error) {
      console.error("فشل في منح الرتبة:", error.message);
      addLog(
        `فشل في منح الرتبة تلقائياً للعضو: ${member.user.tag}`,
        client.user.id,
      );
    }
  }

  // إرسال رسالة خاصة
  if (data.dm) {
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle(processText(data.title, member.user, member.guild))
        .setDescription(processText(data.message, member.user, member.guild))
        .setColor(hexToInt(data.color));

      if (data.thumbnail && isValidUrl(data.thumbnail))
        dmEmbed.setThumbnail(data.thumbnail);
      if (data.banner && isValidUrl(data.banner)) dmEmbed.setImage(data.banner);

      await member.send({ embeds: [dmEmbed] });
      addLog(`تم إرسال رسالة خاصة للعضو: ${member.user.tag}`, client.user.id);
    } catch (error) {
      console.error("فشل في إرسال الرسالة الخاصة:", error.message);
      addLog(
        `فشل في إرسال رسالة خاصة للعضو: ${member.user.tag}`,
        client.user.id,
      );
    }
  }
});

// تسجيل الدخول
client.once("clientReady", () => {
  console.log(`
 ▄▄▄▄▄▄▄ ▄▄▄▄▄▄▄ ▄▄▄▄▄▄▄ ▄▄▄▄▄▄▄ ▄▄▄▄▄▄     ▄▄▄▄▄▄▄ ▄▄▄▄▄▄▄ ▄▄   ▄▄ ▄▄▄▄▄▄  ▄▄▄ ▄▄▄▄▄▄▄ 
█       █       █       █       █      █   █       █       █  █ █  █      ██   █       █
█  ▄▄▄▄▄█    ▄  █    ▄▄▄█    ▄▄▄█  ▄    █  █  ▄▄▄▄▄█▄     ▄█  █ █  █  ▄    █   █   ▄   █
█ █▄▄▄▄▄█   █▄█ █   █▄▄▄█   █▄▄▄█ █ █   █  █ █▄▄▄▄▄  █   █ █  █▄█  █ █ █   █   █  █ █  █
█▄▄▄▄▄  █    ▄▄▄█    ▄▄▄█    ▄▄▄█ █▄█   █  █▄▄▄▄▄  █ █   █ █       █ █▄█   █   █  █▄█  █
 ▄▄▄▄▄█ █   █   █   █▄▄▄█   █▄▄▄█       █   ▄▄▄▄▄█ █ █   █ █       █       █   █       █
█▄▄▄▄▄▄▄█▄▄▄█   █▄▄▄▄▄▄▄█▄▄▄▄▄▄▄█▄▄▄▄▄▄█   █▄▄▄▄▄▄▄█ █▄▄▄█ █▄▄▄▄▄▄▄█▄▄▄▄▄▄██▄▄▄█▄▄▄▄▄▄▄█
                `);
  console.log(`✅Bot is Ready! ${client.user.tag}!`);
  console.log(`🔧Code by SPEED Studio`);
  console.log(`🔗discord.gg/SP`);

  // تسجيل الأمر
  const commands = [
    {
      name: "welcome",
      description: "فتح لوحة تحكم نظام الترحيب",
    },
  ];

  client.application.commands
    .set(commands)
    .then(() => console.log("✅ تم تسجيل الأوامر بنجاح"))
    .catch(console.error);
});

// تشغيل البوت
client.login(process.env.TOKEN).catch((error) => {
  console.error("❌ فشل في تسجيل الدخول:", error.message);
  process.exit(1);
});
// --- KEEP BOT ALIVE SERVER ---
const express = require('express');
const app = express();

app.get("/", (req, res) => {
  res.send("✅ Bot is Alive and Running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌍 Web server is running on port ${PORT}`));
// --- END SERVER SECTION ---

