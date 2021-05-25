const Discord = require('discord.js');
const client = new Discord.Client();
const https = require('https');
const Canvas = require('canvas');
const fs = require('fs');

if (!fs.existsSync('./config.json')) {
  let jsonString = JSON.stringify({
    token: "",
    debugMode: false
  });
  fs.writeFileSync('./config.json', jsonString, (err) => {
    if (err) return console.log(err);
  });
}
const config = require('./config.json');

const commandExtraRegex = /((.)*\([A-Za-z 0-9]+\))/g;
const cardNameRegex = /(\[{2}[a-zA-Z, '0-9]+\]{2})|(\{{2}[a-zA-Z, '0-9]+\}{2})/g;

if (typeof config.token != "string" || config.token == "") {
  throw new Error("The token is not set or is not a string, set it in config.json");
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('message', (message) => {
  if (message.author.id === client.user.id) return;

  var cardsMentioned = message.content.match(cardNameRegex);
  if (cardsMentioned != null) {
    const cards = processMentionedCards(cardsMentioned);
    captureAndSendCards(message, cards);
  }

  if (message.content.startsWith('!')) {
    processCommand(message);
  }

});

function processCommand(message) {
  let command = message.content.split(' ')[0].substring(1);
  let args = message.content.split(' ').slice(1);

  if (config.debugMode) console.log(command, args);

  if (command.startsWith('debug')) {
    if (message.member.roles.cache.some(role => role.name === 'Admin')) {
      config.debugMode = !config.debugMode;
      fs.writeFile('./config.json', JSON.stringify(config), (err) => {
        if (err) return console.log(err);
      });
      message.channel.send(`Debug mode ${config.debugMode ? 'Enabled' : 'Disabled'}`);
    }
  } else if (command.startsWith('quit')) {
     if (message.member.roles.cache.some(role => role.name === 'Admin')) {
       if (config.debugMode) console.log('Stopping bot');
       process.exit();
     }
  } else if (command.startsWith('q') || command.startsWith('search')) {
    searchCommand(command, message, args);
  } else if (command.startsWith('r') || command.startsWith('random')) {
    randomCard(message, args);
  } else if (command.startsWith('t') || command.startsWith('tuktuk')) {
    captureAndSendCards(message, [{searchtype:'fuzzy', name:'tuktuk the returned'}]);
  } else if (command.startsWith('d') || command.startsWith('delete')) {
    message.channel.messages.fetch(args[0]).then((msg) => {
      if (msg.embeds[0].footer.text == ''+message.author.id) msg.delete();
    });
    message.delete();
  }
}

function randomCard(message, args) {
  const argument = args.join(' ');

  https.get(`https://api.scryfall.com/cards/random${argument != '' ? '?q='+argument : ''}`, (res) =>{
    let body = "";

    res.on('data', (data) => {
      body += data;
    });

    res.on('end', () => {
      let object = JSON.parse(body);

      if (object.object == 'error') {
        if (object.code == 'not_found') {
          message.channel.send(object.details);
        }
        if (config.debugMode) console.log(object);
        return;
      }

      sendCardEmbed(object, message.channel);
    });
  });
}

function searchCommand(command, message, args) {
  let commandExtra = command.match(commandExtraRegex);
  if (commandExtra != null) {
    commandExtra = commandExtra[0].substring(commandExtra[0].indexOf('(')+1, commandExtra[0].length-1);
  }

  let pages = 1;

  for (i = 0; i < args.length; i++) {
    if (args[i].startsWith('page') || args[i].startsWith('pages')) {
      pages = args[i].split(':')[1] > 3 ? 3 : args[i].split(':')[1];
      args.splice(i);
      break;
    }
  }

  let argument = args.join(' ');

  https.get(`https://api.scryfall.com/cards/search?q=${argument + (commandExtra != null ? '&order=' + commandExtra : '')}`, (res) =>{
    let body = "";

    res.on('data', (data) => {
      body += data;
    });

    res.on('end', () => {
      let object = JSON.parse(body);

      if (config.debugMode) console.log(object.object);

      if (object.object == 'error') {
        if (object.code == 'not_found') {
          message.channel.send(object.details);
        }
        if (config.debugMode) console.log(object);
        return;
      }

      let cards = [];

      let length = object.total_cards >= (25 * pages) ? (25 * pages) : object.total_cards;

      for (i = 0; i < length; i++) {
        if (object.data[i] == undefined) {
          message.channel.send('Arguments was used that could not be understood');
          return;
        }

        cards.push({
          name: object.data[i].name,
          cost: object.data[i].mana_cost != undefined ? object.data[i].mana_cost.replace(/(\{)/g, '').replace(/(\})/g, '') : ''
        })
      }
      sendSearchEmbed(
        cards,
        `https://scryfall.com/search?q=${argument + (commandExtra != null ? '&order=' + commandExtra : '')}`,
        message,
        pages,
        object.total_cards);
    });
  });
}

async function sendSearchEmbed(cards, link, message, pages, totalCards) {
  let text = [];
  for (i = 0; i < pages; i++) {
    text.push('');
  }

  for (i = 0; i < cards.length; i++) {
    text[Math.floor(i/25)] += `${cards[i].name} (${cards[i].cost})\n`;
  }

  link = link.replace(/( )/g, '%20');
  if (config.debugMode) console.log(link);

  let fields = [];

  for (i = 0; i < pages; i++) {
    fields.push({ name: `Page ${i+1}`, value: text[i], inline: true })
  }

  let embed = new Discord.MessageEmbed()
    .setColor('#0099ff')
    .setTitle('Search')
    .setURL(link)
    .setDescription(`Cards found: ${totalCards}`)
    .addFields(fields);


  message.channel.send(embed);
}

function processMentionedCards(cardsMentioned) {
  var cards = [];
  for (i = 0; i < cardsMentioned.length; i++) {
    let nameLength = cardsMentioned[i].length;
    cards.push({
      name: cardsMentioned[i].substring(2, nameLength-2),
      searchtype: cardsMentioned[i].startsWith('[') ? 'exact' : 'fuzzy'
    });
  }
  return cards;
}

async function captureAndSendCards(message, cards) {
  for (i = 0; i < cards.length; i++) {
    let card = {...cards[i]};
    https.get(`https://api.scryfall.com/cards/named?${cards[i].searchtype}=${cards[i].name}`, (res) =>{
      let body = "";

      res.on('data', (data) => {
        body += data;
      });

      res.on('end', () => {
        let object = JSON.parse(body);

        if (object.object == 'error') {
          if (object.code == 'not_found') {
            message.channel.send(object.details);
          }
          if (config.debugMode) console.log(object);
          return;
        }

        sendCardEmbed(object, message.channel, message.author);
      });
    });
  }
}

async function sendCardEmbed(card, channel, sender) {
  let canvas = undefined;
  if (card.card_faces != undefined) {
    canvas = Canvas.createCanvas(976, 680);
    const context = canvas.getContext('2d');

    const front = await Canvas.loadImage(card.card_faces[0].image_uris.normal);
    const back = await Canvas.loadImage(card.card_faces[1].image_uris.normal);

    context.drawImage(front, 0, 0, 488, 680);
    context.drawImage(back, 488, 0, 488, 680);
  } else {
    canvas = Canvas.createCanvas(488, 680);
    const context = canvas.getContext('2d');

    const front = await Canvas.loadImage(card.image_uris.normal);

    context.drawImage(front, 0, 0, 488, 680);
  }

  const attachment = new Discord.MessageAttachment(canvas.toBuffer(), 'bufferedfilename.png');

  let embed = new Discord.MessageEmbed()
    .setColor('#0099ff')
    .setTitle(card.name)
    .setURL(card.purchase_uris.cardmarket)
    .attachFiles(attachment)
    .setImage('attachment://bufferedfilename.png')
    .addFields([
      { name: 'Standard', value: legalityRewrite(card.legalities.standard), inline:true },
      { name: 'Modern', value: legalityRewrite(card.legalities.modern), inline:true },
      { name: 'Commander', value: legalityRewrite(card.legalities.commander), inline:true }
    ])
    .setFooter(sender.id);


  channel.send(embed).then((message) => {
    message.edit(embed.setDescription('Id: '+message.id));
  });
}

function legalityRewrite(legality) {
  return legality == 'legal' ? 'Legal' : 'Illegal'
}

client.login(config.token);
