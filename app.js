const { Client, GatewayIntentBits, Events, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { ROLE_ID } = require('./config.json');
const mysql = require('mysql2/promise'); // Импортируем MySQL
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// MySQL подключение
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
};

// Проверьте, существует ли папка для баз данных
const dbDirectory = path.join(__dirname, 'databases');
if (!fs.existsSync(dbDirectory)) {
    fs.mkdirSync(dbDirectory);
}

// Укажите ID категории здесь
const CATEGORY_ID = '1273410476348280954'; // Замените на свой актуальный ID категории

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// Проверка ROLE_ID
console.log('ROLE_ID Type:', Array.isArray(ROLE_ID), ROLE_ID);

// Убедитесь, что ROLE_ID - это массив строк
const validRoleIds = Array.isArray(ROLE_ID) ? ROLE_ID : [ROLE_ID];

client.on(Events.MessageCreate, async (message) => {
    if (message.content.startsWith('!createticket')) {
        if (!message.member.permissions.has('ADMINISTRATOR')) {
            return message.channel.send('У вас нет прав на создание тикета.');
        }

        await sendTicketSelectionMenu(message.channel);
    }
});

// Функция для отправки меню выбора тикета с кнопками
async function sendTicketSelectionMenu(channel) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Создание тикета')
        .setDescription('Выберите тип тикета из кнопок ниже:')
        .setTimestamp()
        .setFooter({ text: 'Выберите пользователя или вариант.' });

    const userButton = new ButtonBuilder()
        .setCustomId('user_ticket')
        .setLabel('На пользователя')
        .setStyle(ButtonStyle.Primary);

    const exploitButton = new ButtonBuilder()
        .setCustomId('tsb_exploit')
        .setLabel('tsb-exploit')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(userButton, exploitButton);

    await channel.send({ embeds: [embed], components: [row] });
}

// Функция для создания тикета
async function createTicket(user, ticketName, description, interaction) {
    const ticketId = `${user.username}-${Date.now()}`; // Уникальный ID тикета

    try {
        const channel = await interaction.guild.channels.create({
            name: `ticket-${ticketName}-${user.username}`,
            type: 0, // GUILD_TEXT
            parent: CATEGORY_ID,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    deny: ['ViewChannel'],
                },
                {
                    id: user.id,
                    allow: ['ViewChannel'],
                },
                ...validRoleIds.map(roleId => ({
                    id: roleId,
                    allow: ['ViewChannel'],
                })),
            ],
        });

        // Используем MySQL
        const db = await mysql.createConnection(dbConfig);

        const query = 'INSERT INTO tickets (id, creator, channelId) VALUES (?, ?, ?)';
        await db.execute(query, [ticketId, user.id, channel.id]);

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Тикет создан!')
            .setDescription(description)
            .setTimestamp()
            .setFooter({ text: 'Обратитесь к администратору, если нужна помощь.' });

        const closeButton = new ButtonBuilder()
            .setCustomId('closeTicket')
            .setLabel('Закрыть тикет')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(false); // Кнопка активна

        const row = new ActionRowBuilder().addComponents(closeButton);

        await channel.send({ embeds: [embed], components: [row] });

    } catch (error) {
        console.error(error);
    }
}

// Обработка взаимодействий с кнопками
client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton()) {
        const ticketType = interaction.customId;

        // Инициализация переменной для описания тикета 
        let embedDescription = '';

        // Создание описания тикета в зависимости от типа
        if (ticketType === 'user_ticket') {
            embedDescription = `Тикет: На пользователя\n\n**Инструкция**: Пожалуйста, укажите имя нарушителя, правило, которое было нарушено, и ссылку на доказательства.`;
        } else if (ticketType === 'tsb_exploit') {
            embedDescription = `Тикет: tsb-exploit\n\n**Инструкция**: Пожалуйста, укажите логин пользователя, ссылку на профиль и ссылку на видео-доказательства.`;
        }

        // Обработка закрытия тикета
        if (ticketType === 'closeTicket') {
            const channel = interaction.channel;

            const db = await mysql.createConnection(dbConfig);
            try {
                const [rows] = await db.execute('SELECT * FROM tickets WHERE channelId = ?', [channel.id]);
                const ticketData = rows[0];
                
                if (ticketData && ticketData.creator === interaction.user.id) {
                    await interaction.reply({ content: 'Тикет закрыт!', ephemeral: true });
                    await channel.delete('Тикет закрыт администратором.');

                    await db.execute('DELETE FROM tickets WHERE channelId = ?', [channel.id]);
                } else {
                    await interaction.reply({ content: 'Вы не можете закрыть этот тикет!', ephemeral: true });
                }
            } catch (error) {
                console.error('Ошибка при закрытии тикета:', error);
                await interaction.reply({ content: 'Произошла ошибка при закрытии тикета.', ephemeral: true });
            } finally {
                db.end();
            }
            return; // Выход сразу после обработки закрытия тикета
        }

        // Если не закрываем тикет, создаем тикет
        await createTicket(interaction.user, ticketType, embedDescription, interaction);
        await interaction.reply({ content: `Тикет успешно создан!`, ephemeral: true });
    }
});

// Слушаем событие выхода процесса для безопасного закрытия базы данных
process.on('exit', () => {
    console.log('Бот выключается.');
});

client.login(process.env.TOKEN); // Или используйте свой токен напрямую
