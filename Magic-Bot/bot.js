const Discord = require('discord.js');
const client = new Discord.Client();
const config = require('./config.json');
const https = require('https');
const Canvas = require('canvas');

if (typeof config.token != "string" || config.token == "") {
  throw new Error("The token is not set or is not a string");
}

const cardNameRegex = /(\[{2}[a-zA-Z '0-9]+\]{2})|(\{{2}[a-zA-Z '0-9]+\}{2})/g;

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('message', (message) => {
  if (message.author.id === client.user.id) return;

  var matches = message.content.match(cardNameRegex);
  if (matches != null) captureAndSendCards(message, matches);
});

async function captureAndSendCards(message, matches) {
  var cards = [];
  for (i = 0; i < matches.length; i++) {
    let matchLength = matches[i].length;
    cards.push({
      name: matches[i].substring(2, matchLength-2),
      type: matches[i].startsWith('[') ? 'exact' : 'fuzzy'
    });
  }

  for (i = 0; i < cards.length; i++) {
    let card = {...cards[i]};
    https.get(`https://api.scryfall.com/cards/named?${cards[i].type}=${cards[i].name}`, (res) =>{
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
    })
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
    .addFields(
      { name: 'Standard', value: legalityRewrite(card.legalities.standard), inline:true },
      { name: 'Modern', value: legalityRewrite(card.legalities.modern), inline:true },
      { name: 'Commander', value: legalityRewrite(card.legalities.commander), inline:true }
    );


  channel.send(embed);
}

function legalityRewrite(legality) {
  return legality == 'legal' ? 'Legal' : 'Illegal'
}

client.login(config.token);
