const { Client, GatewayIntentBits, Events, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { ROLE_ID } = require('./config.json');
const Database = require('better-sqlite3');
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

// Create a directory for databases if it doesn't exist
const dbDirectory = path.join(__dirname, 'databases');
if (!fs.existsSync(dbDirectory)) {
    fs.mkdirSync(dbDirectory);
}

// Specify the category ID here
const CATEGORY_ID = '1273410476348280954'; // Replace with your actual category ID

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// Check ROLE_ID
console.log('ROLE_ID Type:', Array.isArray(ROLE_ID), ROLE_ID);

// Ensure ROLE_ID is an array of strings
const validRoleIds = Array.isArray(ROLE_ID) ? ROLE_ID : [ROLE_ID];

client.on(Events.MessageCreate, async (message) => {
    if (message.content.startsWith('!createticket')) {
        if (!message.member.permissions.has('ADMINISTRATOR')) {
            return message.channel.send('У вас нет прав на создание тикета.');
        }

        await sendTicketSelectionMenu(message.channel);
    }
});

// Function to send the ticket selection menu with buttons
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

// Create a ticket function for user violations or tsb-exploit
async function createTicket(user, ticketName, description, interaction) {
    const dbFile = path.join(dbDirectory, `tickets-${user.username}.db`);
    const db = new Database(dbFile);

    db.exec(`
        CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY,
            creator TEXT,
            channelId TEXT
        )
    `);

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

        // Store ticket data in the database
        const stmt = db.prepare('INSERT INTO tickets (id, creator, channelId) VALUES (?, ?, ?)');
        stmt.run(channel.id, user.id, channel.id);

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Тикет создан!')
            .setDescription(description)
            .setTimestamp()
            .setFooter({ text: 'Обратитесь к администратору, если нужна помощь.' });

        const closeButton = new ButtonBuilder()
            .setCustomId('closeTicket')
            .setLabel('Закрыть тикет')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(closeButton);

        await channel.send({ embeds: [embed], components: [row] });

    } catch (error) {
        console.error(error);
    } finally {
        db.close();
    }
}

// Handle button interactions for ticket type selection and closing tickets
client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton()) {
        const ticketType = interaction.customId;
        
        // Create ticket description based on type
        let embedDescription;
        if (ticketType === 'user_ticket') {
            embedDescription = `Тикет: На пользователя\n\n**Инструкция**: Пожалуйста, укажите имя нарушителя, правило, которое было нарушено, и ссылку на доказательства.`;
        } else if (ticketType === 'tsb_exploit') {
            embedDescription = `Тикет: tsb-exploit\n\n**Инструкция**: Пожалуйста, укажите логин пользователя, ссылку на профиль и ссылку на видео-доказательства.`;
        } else if (ticketType === 'closeTicket') {
            const channel = interaction.channel;
            const dbFile = path.join(dbDirectory, `tickets-${interaction.user.username}.db`);
            const db = new Database(dbFile);

            try {
                const ticketData = db.prepare('SELECT * FROM tickets WHERE channelId = ?').get(channel.id);
                if (ticketData && ticketData.creator === interaction.user.id) {
                    await interaction.reply({ content: 'Тикет закрыт!', ephemeral: true });
                    await channel.delete('Тикет закрыт администратором.');

                    // Close the database before deleting the file
                    db.close();

                    // Adding a timeout before deleting the file
                    setTimeout(() => {
                        if (fs.existsSync(dbFile)) {
                            fs.unlinkSync(dbFile); // Delete the database file
                            console.log(`Deleted database file: ${dbFile}`);
                        }
                    }, 100); // 100ms delay
                } else {
                    await interaction.reply({ content: 'Вы не можете закрыть этот тикет!', ephemeral: true });
                }
            } catch (error) {
                console.error('Ошибка при закрытии тикета:', error);
                await interaction.reply({ content: 'Произошла ошибка при закрытии тикета.', ephemeral: true });
            } finally {
                db.close();
            }
            return; // Exit early after handle closeTicket
        }

        // If not closing a ticket, create the ticket
        await createTicket(interaction.user, ticketType, embedDescription, interaction);
        await interaction.reply({ content: `Тикет успешно создан!`, ephemeral: true });
    }
});

// Listen for the process exit event to safely close the database
process.on('exit', () => {
    console.log('Бот выключается.');
});

client.login(process.env.TOKEN); // или используйте свой токен напрямую