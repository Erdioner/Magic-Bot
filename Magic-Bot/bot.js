const Discord = require('discord.js');
const client = new Discord.Client();
const config = require('./config.json');
const https = require('https');
const { fetchMkmCard } = require('fetch-mkm-card');

if (typeof config.token != "string" || config.token == "") {
  throw new Error("The token is not set or is not a string");
}

if (typeof config.mkm.token != "string" || config.mkm.token == "") {
  throw new Error("The mkm.token is not set or is not a string");
}

if (typeof config.mkm.secret != "string" || config.mkm.secret == "") {
  throw new Error("The mkm.secret is not set or is not a string");
}

if (typeof config.mkm.accessToken != "string" || config.mkm.accessToken == "") {
  throw new Error("The mkm.accessToken is not set or is not a string");
}

if (typeof config.mkm.accessSecret != "string" || config.mkm.accessSecret == "") {
  throw new Error("The mkm.accessSecret is not set or is not a string");
}

fetchMkmCard.init(config.mkm);

const cardNameRegex = /(\[{2}[a-zA-Z '0-9]+\]{2})|(\{{2}[a-zA-Z '0-9]+\}{2})/g;

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('message', (message) => {
  if (message.author.id === client.user.id) return;

  var matches = message.content.match(cardNameRegex);
  if (matches == null) return;

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

        const attachment = new Discord.MessageAttachment(object.image_uris.normal);
        message.channel.send(attachment);
        message.channel.send("€" + object.prices.eur);
      });
    })
  }
});

client.login(config.token);
