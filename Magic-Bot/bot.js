const Discord = require('discord.js');
const client = new Discord.Client();
const config = require('./config.json');
const https = require('https');

if (typeof config.token != "string" || config.token == "") {
  throw new Error("The token is not set or is not a string");
}

const cardNameRegex = /(\[\[[a-zA-Z '0-9]+\]\])/g;

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('message', (message) => {
  if (message.author.id === client.user.id) return;

  var matches = message.content.match(cardNameRegex);
  console.log(matches);
  if (matches == null) return;

  var cardnames = [];
  for (i = 0; i < matches.length; i++) {
    let matchLength = matches[i].length;
    cardnames.push(matches[i].substring(2, matchLength-2));
  }

  for (i = 0; i < cardnames.length; i++) {
    https.get(`https://api.scryfall.com/cards/named?exact=${cardnames[i]}`, (res) =>{
      let body = "";

      res.on('data', (data) => {
        body += data;
      });

      res.on('end', () => {
        let object = JSON.parse(body);

        const attachment = new Discord.MessageAttachment(object.image_uris.normal);
        message.channel.send(attachment);
      });
    })
  }
});

client.login(config.token);
