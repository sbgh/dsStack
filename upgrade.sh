#!/bin/bash

echo "stop dsStack"
# sudo pm2 stop dsStack
sudo curl https://raw.githubusercontent.com/cybera/dsStack/master/Server.js -o Server.js
sudo sed -i 's|/etc/ssl/private|/etc/letsencrypt/live/dsstack.cybera.ca|g' Server.js
sudo pm2 restart dsStack
