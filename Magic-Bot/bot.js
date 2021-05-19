const Discord = require('discord.js');
const client = new Discord.Client();
const config = require('./config.json');
const https = require('https');
const Canvas = require('canvas');

const cardNameRegex = /(\[{2}[a-zA-Z, '0-9]+\]{2})|(\{{2}[a-zA-Z, '0-9]+\}{2})/g;

if (typeof config.token != "string" || config.token == "") {
  throw new Error("The token is not set or is not a string");
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

  if (command == 'q' || command == 'search') {
    searchCommand(message, args);
  } else if (command == 'r' || command == 'random') {
    randomCard(message);
  } else if (command == 't' || command == 'tuktuk') {
    captureAndSendCards(message, [{searchtype:'fuzzy', name:'tuktuk the returned'}]);
  }
}

function randomCard(message) {
  https.get(`https://api.scryfall.com/cards/random`, (res) =>{
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
        console.log(object);
        return;
      }

      sendCardEmbed(object, message.channel);
    });
  });
}

function searchCommand(message, args) {
  let argument = args.join(' ');

  https.get(`https://api.scryfall.com/cards/search?q=${argument}`, (res) =>{
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
        console.log(object);
        return;
      }

      let cards = [];

      let length = object.total_cards >= 25 ? 25 : object.total_cards;

      for (i = 0; i < length; i++) {
        cards.push({
          name: object.data[i].name,
          cost: object.data[i].mana_cost != undefined ? object.data[i].mana_cost.replace('{', '').replace('}', '') : ''
        })
      }

      sendSearchEmbed(cards, `https://scryfall.com/search?q=${argument}`, message);
    });
  });
}

async function sendSearchEmbed(cards, link, message) {
  let text = '';
  for (i = 0; i < cards.length; i++) {
    text += `${cards[i].name} (${cards[i].cost})\n`;
  }

  let embed = new Discord.MessageEmbed()
    .setColor('#0099ff')
    .setTitle('Search')
    .setURL(link)
    .setDescription(text);


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
          console.log(object);
          return;
        }

        sendCardEmbed(object, message.channel);
      });
    });
  }
}

async function sendCardEmbed(card, channel) {
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
    ]);


  channel.send(embed);
}

function legalityRewrite(legality) {
  return legality == 'legal' ? 'Legal' : 'Illegal'
}

client.login(config.token);
