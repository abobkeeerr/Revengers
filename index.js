const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, SlashCommandBuilder, Routes, InteractionType, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { token, clientId, guildId, adminRoles, logsChannelId } = require('./config.json');
const fs = require('fs');
const path = require('path');
const { REST } = require('@discordjs/rest');

// تعريف البوت
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

// تحميل البيانات
let ticketData = {};
let db = { sections: {} };
let ticketCounter = { lastNumber: 0 };

// دالة لتحميل البيانات مع التعامل مع الأخطاء
function loadData() {
  try {
    if (fs.existsSync('./ticket.json')) {
      ticketData = JSON.parse(fs.readFileSync('./ticket.json'));
    }
    if (fs.existsSync('./database.json')) {
      db = JSON.parse(fs.readFileSync('./database.json'));
    }
    if (fs.existsSync('./tickets_counter.json')) {
      ticketCounter = JSON.parse(fs.readFileSync('./tickets_counter.json'));
    }
  } catch (err) {
    console.error('خطأ في تحميل الملفات:', err);
    // إنشاء ملفات جديدة إذا كانت معطوبة
    saveData();
  }
}

loadData();

// تعريف الأوامر
const commands = [
  new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('ينشئ نظام التذاكر في الروم الحالي')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('يفتح لوحة تحكم التذاكر')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

// تسجيل الأوامر عند التشغيل
(async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log('✅ تم تسجيل الأوامر بنجاح');
  } catch (err) {
    console.error('❌ خطأ في تسجيل الأوامر:', err);
  }
})();

// الدوال المساعدة
function saveData() {
  try {
    fs.writeFileSync(path.join(__dirname, 'ticket.json'), JSON.stringify(ticketData, null, 2));
    fs.writeFileSync(path.join(__dirname, 'database.json'), JSON.stringify(db, null, 2));
    fs.writeFileSync(path.join(__dirname, 'tickets_counter.json'), JSON.stringify(ticketCounter, null, 2));
  } catch (err) {
    console.error('خطأ في حفظ البيانات:', err);
  }
}

async function checkBotPermissions(guild) {
  const me = await guild.members.fetchMe();
  const requiredPerms = [
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages
  ];
  
  const missing = me.permissions.missing(requiredPerms);
  if (missing.length > 0) {
    console.error('❌ البوت ينقصه الصلاحيات التالية:', missing);
    return false;
  }
  return true;
}

function isAdmin(member) {
  return member?.roles?.cache?.some(role => adminRoles.includes(role.id));
}

function isTicketStaff(member, ticketRoleId) {
  if (!ticketRoleId) return isAdmin(member);
  return member?.roles?.cache?.has(ticketRoleId) || isAdmin(member);
}

async function createLog(action, executor, target, details = {}) {
  const logChannel = client.channels.cache.get(logsChannelId);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle(`📝 سجل التذاكر - ${action}`)
    .setColor('#FFFF00')
    .addFields(
      { name: 'الإجراء', value: action, inline: true },
      { name: 'المشرف', value: `${executor} (${executor.user.tag})`, inline: true },
      { name: 'الهدف', value: target || 'لا يوجد', inline: true },
      { name: 'الوقت', value: new Date().toLocaleString('ar-SA'), inline: true },
      { name: 'التفاصيل', value: details.extra || 'لا توجد تفاصيل إضافية', inline: false }
    )
    .setFooter({ 
      text: `${client.guilds.cache.get(guildId)?.name}`, 
      iconURL: client.guilds.cache.get(guildId)?.iconURL() 
    })
    .setTimestamp();

  await logChannel.send({ embeds: [embed] }).catch(console.error);
}

async function createTicketChannel(guild, member, section) {
  ticketCounter.lastNumber += 1;
  const ticketNumber = ticketCounter.lastNumber;
  const channelName = `🎫・${ticketNumber}`;

  try {
    // التحقق من صلاحيات البوت أولاً
    if (!await checkBotPermissions(guild)) {
      throw new Error('البوت لا يملك الصلاحيات اللازمة');
    }

    // التحقق من وجود العضو في الكاش
    const ticketCreator = await guild.members.fetch(member.id).catch(() => null);
    if (!ticketCreator) {
      throw new Error('العضو غير موجود في السيرفر');
    }

    // جلب الرول والتأكد من وجوده
    const supportRole = await guild.roles.fetch(section.role).catch(() => null);
    
    // جلب الكاتجوري والتأكد من وجوده
    const category = section.category ? await guild.channels.fetch(section.category).catch(() => null) : null;

    // إنشاء مصفوفة صلاحيات القناة
    const permissionOverwrites = [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: ticketCreator.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ],
      }
    ];

    // إضافة صلاحيات الرول إذا كان موجوداً
    if (supportRole) {
      permissionOverwrites.push({
        id: supportRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ],
      });
    }

    // إضافة صلاحيات المشرفين
    for (const roleId of adminRoles) {
      const adminRole = await guild.roles.fetch(roleId).catch(() => null);
      if (adminRole) {
        permissionOverwrites.push({
          id: adminRole.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels
          ],
        });
      }
    }

    // إنشاء القناة
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category?.id || null,
      permissionOverwrites,
      topic: `${member.id}|${section.role}`,
      reason: `New ticket created by ${member.user.tag}`
    });

    saveData();

    // إنشاء رسالة الترحيب
    const embed = new EmbedBuilder()
      .setTitle(`تذكرة #${ticketNumber} - ${section.title}`)
      .setDescription(section.description)
      .setColor(ticketData.embedColor || '#0099ff')
      .setFooter({ 
        text: `${guild.name} | من إنشاء: ${member.user.tag}`, 
        iconURL: guild.iconURL() || undefined 
      });

    if (ticketData.serverBanner) {
      embed.setImage(ticketData.serverBanner);
    }

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('إغلاق التذكرة')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('add_member')
        .setLabel('إضافة عضو')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('claim_ticket')
        .setLabel('استلام التذكرة')
        .setStyle(ButtonStyle.Primary)
    );

    const mention = supportRole ? `<@&${supportRole.id}>` : '';
    await channel.send({ 
      content: `<@${member.id}> ${mention}`,
      embeds: [embed],
      components: [buttons]
    });

    await createLog('تم إنشاء تذكرة', member, channel.name, {
      extra: `القسم: ${section.title} | الرقم: #${ticketNumber}`
    });

    return channel;
  } catch (err) {
    console.error('خطأ في إنشاء التذكرة:', err);
    
    // إرسال رسالة خطأ للعضو إذا فشل إنشاء التذكرة
    try {
      await member.send('❌ تعذر إنشاء التذكرة، يرجى المحاولة لاحقاً أو التواصل مع الإدارة');
    } catch (dmError) {
      console.error('فشل إرسال رسالة خاصة:', dmError);
    }
    
    return null;
  }
}

async function closeTicket(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('close_reason_modal')
    .setTitle('إغلاق التذكرة')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('close_reason')
          .setLabel('سبب الإغلاق (اختياري)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
      )
    );
  
  await interaction.showModal(modal);
}

async function updateTicketStatus(channel, status) {
  const ticketNumber = channel.name.split('・')[1];
  const newName = status === 'closed' ? `🔐・${ticketNumber}` : `🎫・${ticketNumber}`;
  
  try {
    await channel.setName(newName);
    return true;
  } catch (err) {
    console.error('خطأ في تحديث حالة التذكرة:', err);
    return false;
  }
}

// الأحداث
client.once('ready', () => {
  console.log(`✅ تم تسجيل الدخول باسم ${client.user.tag}`);
  console.log(`
 ▄▄▄▄▄▄▄ ▄▄▄▄▄▄▄ ▄▄▄▄▄▄▄ ▄▄▄▄▄▄▄ ▄▄▄▄▄▄     ▄▄▄▄▄▄▄ ▄▄▄▄▄▄▄ ▄▄   ▄▄ ▄▄▄▄▄▄  ▄▄▄ ▄▄▄▄▄▄▄ 
█       █       █       █       █      █   █       █       █  █ █  █      ██   █       █
█  ▄▄▄▄▄█    ▄  █    ▄▄▄█    ▄▄▄█  ▄    █  █  ▄▄▄▄▄█▄     ▄█  █ █  █  ▄    █   █   ▄   █
█ █▄▄▄▄▄█   █▄█ █   █▄▄▄█   █▄▄▄█ █ █   █  █ █▄▄▄▄▄  █   █ █  █▄█  █ █ █   █   █  █ █  █
█▄▄▄▄▄  █    ▄▄▄█    ▄▄▄█    ▄▄▄█ █▄█   █  █▄▄▄▄▄  █ █   █ █       █ █▄█   █   █  █▄█  █
 ▄▄▄▄▄█ █   █   █   █▄▄▄█   █▄▄▄█       █   ▄▄▄▄▄█ █ █   █ █       █       █   █       █
█▄▄▄▄▄▄▄█▄▄▄█   █▄▄▄▄▄▄▄█▄▄▄▄▄▄▄█▄▄▄▄▄▄█   █▄▄▄▄▄▄▄█ █▄▄▄█ █▄▄▄▄▄▄▄█▄▄▄▄▄▄██▄▄▄█▄▄▄▄▄▄▄█
                `);
        console.log(`Bot is Ready! ${client.user.tag}!`);
        console.log(`Code by SPEED Studio`);
        console.log(`discord.gg/SP`);
  // إعادة تحميل البيانات عند إعادة التشغيل
  loadData();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.guild) return;

  try {
    if (interaction.isChatInputCommand()) {
      const { commandName, member } = interaction;

      if (!isAdmin(member)) {
        return interaction.reply({ content: '❌ هذا الأمر للإدارة فقط', flags: MessageFlags.Ephemeral });
      }

      if (commandName === 'ticket-setup') {
        const embed = new EmbedBuilder()
          .setTitle('افتح تذكرتك 🎟️')
          .setDescription(ticketData.messageContent || 'اختار نوع التذكرة من القائمة تحت')
          .setColor(ticketData.embedColor || '#0099ff');

        if (ticketData.serverBanner) {
          embed.setImage(ticketData.serverBanner);
        }

        embed.setFooter({ 
          text: interaction.guild.name, 
          iconURL: interaction.guild.iconURL() || undefined 
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('open_ticket')
            .setLabel('افتح تذكرة')
            .setStyle(ButtonStyle.Primary)
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ تم تنصيب نظام التذاكر بنجاح', flags: MessageFlags.Ephemeral });
        await createLog('تم إعداد التذاكر', member, interaction.channel.name);
      }

      if (commandName === 'ticket-panel') {
        const embed = new EmbedBuilder()
          .setTitle('🎛️ لوحة تحكم التذاكر')
          .setColor(ticketData.embedColor || '#0099ff');

        if (ticketData.serverBanner) {
          embed.setImage(ticketData.serverBanner);
        }

        embed.setFooter({ 
          text: interaction.guild.name, 
          iconURL: interaction.guild.iconURL() || undefined 
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('create_section')
            .setLabel('إنشاء قسم')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('delete_section')
            .setLabel('حذف قسم')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('edit_message')
            .setLabel('تعديل الواجهة')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ 
          embeds: [embed],
          components: [row]
        });
        await createLog('فتح لوحة التحكم', member);
      }
    }

    if (interaction.isButton()) {
      const { customId, member, guild, channel } = interaction;
      const [userId, ticketRoleId] = channel.topic?.split('|') || [];

      // تحقق من الصلاحيات
      if (['close_ticket', 'add_member', 'claim_ticket'].includes(customId)) {
        if (!isTicketStaff(member, ticketRoleId)) {
          return interaction.reply({ content: '❌ هذا الأمر لطاقم التذاكر فقط', flags: MessageFlags.Ephemeral });
        }
      }

      if (customId === 'open_ticket') {
        if (!db.sections || Object.keys(db.sections).length === 0) {
          return interaction.reply({ content: '❌ مافي أقسام متاحة حالياً', flags: MessageFlags.Ephemeral });
        }

        const menu = new StringSelectMenuBuilder()
          .setCustomId('ticket_section_select')
          .setPlaceholder('اختار نوع التذكرة')
          .addOptions(Object.entries(db.sections).map(([number, section]) => ({
            label: section.title,
            description: section.description.slice(0, 100),
            value: number
          })));

        const row = new ActionRowBuilder().addComponents(menu);

        await interaction.reply({ content: '📂 اختار القسم المناسب لك:', components: [row], flags: MessageFlags.Ephemeral });
        return;
      }

      if (customId === 'close_ticket') {
        await closeTicket(interaction);
      }

      if (customId === 'delete_ticket') {
        const channelName = interaction.channel.name;
        await interaction.channel.delete();
        await createLog('تم حذف التذكرة', member, channelName);
      }

      if (customId === 'reopen_ticket') {
        await interaction.channel.permissionOverwrites.edit(userId, {
          ViewChannel: true
        });
        
        await updateTicketStatus(interaction.channel, 'open');
        
        await interaction.update({
          content: '✅ تم إعادة فتح التذكرة',
          components: [],
          embeds: []
        });
        
        await createLog('تم إعادة فتح التذكرة', member, interaction.channel.name);
      }

      if (customId === 'add_member') {
        const modal = new ModalBuilder()
          .setCustomId('add_member_modal')
          .setTitle('إضافة عضو للتذكرة')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('member_id')
                .setLabel('آيدي العضو')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );
        
        await interaction.showModal(modal);
      }

      if (customId === 'claim_ticket') {
        await interaction.reply({
          content: `✅ استلم التذكرة ${member}\nهلا والله كيف نقدر نساعدك؟`,
          allowedMentions: { users: [member.id] }
        });

        await createLog('تم استلام التذكرة', member, interaction.channel.name);
      }

      // أوامر الإدارة فقط
      if (!isAdmin(member)) return;

      if (customId === 'create_section') {
        const modal = new ModalBuilder()
          .setCustomId('modal_create_section')
          .setTitle('إنشاء قسم جديد')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('section_title')
                .setLabel('عنوان القسم')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('section_role')
                .setLabel('آيدي رول المسؤول')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('section_description')
                .setLabel('وصف القسم')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('section_category')
                .setLabel('آيدي الكاتجوري')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('section_number')
                .setLabel('رقم القسم')
                .setStyle(TextInputStyle.Short)
                .setRequired(true))
          );
        await interaction.showModal(modal);
      }

      if (customId === 'delete_section') {
        const modal = new ModalBuilder()
          .setCustomId('modal_delete_section')
          .setTitle('حذف قسم')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('delete_section_number')
                .setLabel('رقم القسم اللي تبي تحذفه')
                .setStyle(TextInputStyle.Short)
                .setRequired(true))
          );
        await interaction.showModal(modal);
      }

      if (customId === 'edit_message') {
        const modal = new ModalBuilder()
          .setCustomId('modal_edit_message')
          .setTitle('تعديل واجهة التذاكر')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('new_message_content')
                .setLabel('الوصف الجديد')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('server_banner')
                .setLabel('رابط البنر')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('server_logo')
                .setLabel('رابط الشعار')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('embed_color')
                .setLabel('لون الإمبد (مثل #0099ff)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false))
          );
        await interaction.showModal(modal);
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'ticket_section_select') {
        const sectionNumber = interaction.values[0];
        const section = db.sections[sectionNumber];
        
        if (!section) {
          return interaction.reply({ content: '❌ مالقيت القسم هذا', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // التحقق من صلاحيات البوت قبل المتابعة
        if (!await checkBotPermissions(interaction.guild)) {
          return interaction.editReply({ 
            content: '❌ البوت لا يملك الصلاحيات اللازمة لإنشاء التذاكر' 
          });
        }

        const ticketChannel = await createTicketChannel(interaction.guild, interaction.member, section);
        
        if (ticketChannel) {
          await interaction.editReply({ content: `✅ تم إنشاء تذكرتك هنا: ${ticketChannel.toString()}` });
        } else {
          await interaction.editReply({ content: '❌ تعذر إنشاء التذكرة، جرب مرة ثانية' });
        }
      }
    }

    if (interaction.type === InteractionType.ModalSubmit) {
      if (!isAdmin(interaction.member) && !interaction.customId.startsWith('close_')) {
        return interaction.reply({ content: '❌ هذا الأمر للإدارة فقط', flags: MessageFlags.Ephemeral });
      }

      if (interaction.customId === 'close_reason_modal') {
        const reason = interaction.fields.getTextInputValue('close_reason') || 'ما تم تحديد سبب';
        const ticketNumber = interaction.channel.name.split('・')[1];
        const [userId, ticketRoleId] = interaction.channel.topic?.split('|') || [];
        
        // تحديث اسم القناة والصلاحيات
        await updateTicketStatus(interaction.channel, 'closed');
        await interaction.channel.permissionOverwrites.edit(userId, {
          ViewChannel: false
        });

        // إرسال رسالة خاصة للعضو
        try {
          const user = await client.users.fetch(userId);
          const dmChannel = await user.createDM();
          
          const closedTicketEmbed = new EmbedBuilder()
            .setTitle(`تم إغلاق تذكرتك #${ticketNumber}`)
            .setDescription(`تم إغلاق تذكرتك في ${interaction.guild.name}`)
            .addFields(
              { name: 'تم الإغلاق بواسطة', value: interaction.member.toString(), inline: true },
              { name: 'وقت الإغلاق', value: new Date().toLocaleString('ar-SA'), inline: true },
              { name: 'سبب الإغلاق', value: reason, inline: false }
            )
            .setFooter({ 
              text: interaction.guild.name, 
              iconURL: interaction.guild.iconURL() 
            })
            .setColor('#FF0000');
          
          await dmChannel.send({ embeds: [closedTicketEmbed] });
        } catch (err) {
          console.error('ماقدرت أرسل الرسالة الخاصة:', err);
        }

        // عرض خيارات ما بعد الإغلاق
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('delete_ticket')
            .setLabel('حذف التذكرة')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('reopen_ticket')
            .setLabel('إعادة فتح التذكرة')
            .setStyle(ButtonStyle.Success)
        );

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`تم إغلاق التذكرة #${ticketNumber}`)
              .setDescription(`**السبب:** ${reason}`)
              .setColor('#FF0000')
          ],
          components: [row]
        });

        await createLog('تم إغلاق التذكرة', interaction.member, `#${ticketNumber}`, {
          extra: `السبب: ${reason}`
        });
      }

      if (interaction.customId === 'add_member_modal') {
        const memberId = interaction.fields.getTextInputValue('member_id');
        
        try {
          // التحقق من وجود العضو في السيرفر أولاً
          const memberToAdd = await interaction.guild.members.fetch(memberId).catch(() => null);
          if (!memberToAdd) {
            return interaction.reply({
              content: '❌ العضو غير موجود في السيرفر',
              flags: MessageFlags.Ephemeral
            });
          }

          await interaction.channel.permissionOverwrites.edit(memberId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          });
          
          await interaction.reply({
            content: `✅ تمت إضافة العضو <@${memberId}> للتذكرة`,
            flags: MessageFlags.Ephemeral
          });
          
          await createLog('تم إضافة عضو للتذكرة', interaction.member, `<@${memberId}>`, {
            extra: `التذكرة: ${interaction.channel.name}`
          });
        } catch (err) {
          await interaction.reply({
            content: '❌ ماقدرت أضيف العضو، تأكد من الآيدي',
            flags: MessageFlags.Ephemeral
          });
        }
      }

      if (interaction.customId === 'modal_create_section') {
        const title = interaction.fields.getTextInputValue('section_title');
        const role = interaction.fields.getTextInputValue('section_role');
        const description = interaction.fields.getTextInputValue('section_description');
        const category = interaction.fields.getTextInputValue('section_category');
        const number = interaction.fields.getTextInputValue('section_number');

        if (!db.sections) db.sections = {};

        if (db.sections[number]) {
          return await interaction.reply({ content: `❌ فيه قسم موجود بالفعل برقم \`${number}\``, flags: MessageFlags.Ephemeral });
        }

        // التحقق من وجود الرول والكاتجوري
        try {
          const roleCheck = await interaction.guild.roles.fetch(role).catch(() => null);
          if (!roleCheck) {
            return await interaction.reply({ 
              content: '❌ الرول المحدد غير موجود', 
              flags: MessageFlags.Ephemeral 
            });
          }

          const categoryCheck = await interaction.guild.channels.fetch(category).catch(() => null);
          if (!categoryCheck) {
            return await interaction.reply({ 
              content: '❌ الكاتجوري المحدد غير موجود', 
              flags: MessageFlags.Ephemeral 
            });
          }

          db.sections[number] = { title, role, description, category };
          saveData();

          await interaction.reply({ 
            content: `✅ تم إنشاء القسم \`${title}\` بنجاح\n📁 الكاتجوري: \`${category}\``, 
            flags: MessageFlags.Ephemeral 
          });
          await createLog('تم إنشاء قسم', interaction.member, title, {
            extra: `الرقم: ${number} | الرول: <@&${role}>`
          });
        } catch (err) {
          console.error('خطأ في إنشاء القسم:', err);
          await interaction.reply({ 
            content: '❌ حدث خطأ أثناء إنشاء القسم', 
            flags: MessageFlags.Ephemeral 
          });
        }
      }

      if (interaction.customId === 'modal_delete_section') {
        const number = interaction.fields.getTextInputValue('delete_section_number');

        if (db.sections && db.sections[number]) {
          const sectionTitle = db.sections[number].title;
          delete db.sections[number];
          saveData();
          await interaction.reply({ 
            content: `🗑️ تم حذف القسم \`${sectionTitle}\` (رقم ${number})`, 
            flags: MessageFlags.Ephemeral 
          });
          await createLog('تم حذف قسم', interaction.member, sectionTitle, {
            extra: `الرقم: ${number}`
          });
        } else {
          await interaction.reply({ 
            content: '❌ مالقيت قسم بهذا الرقم', 
            flags: MessageFlags.Ephemeral 
          });
        }
      }

      if (interaction.customId === 'modal_edit_message') {
        const content = interaction.fields.getTextInputValue('new_message_content');
        const banner = interaction.fields.getTextInputValue('server_banner');
        const logo = interaction.fields.getTextInputValue('server_logo');
        const color = interaction.fields.getTextInputValue('embed_color');

        if (content) ticketData.messageContent = content;
        if (banner) ticketData.serverBanner = banner;
        if (logo) ticketData.serverLogo = logo;
        if (color) ticketData.embedColor = color;

        saveData();

        await interaction.reply({ 
          content: '✅ تم تحديث إعدادات التذاكر:\n' +
                  (content ? '✏️ الوصف\n' : '') +
                  (banner ? '🖼️ البنر\n' : '') +
                  (logo ? '🏷️ الشعار\n' : '') +
                  (color ? '🎨 اللون\n' : ''),
          flags: MessageFlags.Ephemeral
        });
        
        await createLog('تم تعديل واجهة التذاكر', interaction.member, null, {
          extra: `${content ? 'الوصف' : ''}${banner ? ' + البنر' : ''}${logo ? ' + الشعار' : ''}${color ? ' + اللون' : ''}`
        });
      }
    }
  } catch (error) {
    console.error('خطأ في معالجة الأمر:', error);
    if (interaction.isRepliable()) {
      await interaction.reply({ 
        content: '❌ صار خطأ أثناء تنفيذ طلبك', 
        flags: MessageFlags.Ephemeral 
      }).catch(console.error);
    }
  }
});

client.login(token).catch(console.error);