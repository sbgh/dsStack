#!/bin/bash
apt update
curl -sL https://deb.nodesource.com/setup_18.x | sudo bash -
apt -y install nodejs

cd /root/
git clone https://github.com/cybera/dsStack.git
cd /root/dsStack
npm install -y

# install certbot incase it is needed in the near future
apt install -y certbot

mkdir -p /etc/ssl/private

openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/ssl/private/privkey.pem -out /etc/ssl/private/fullchain.pem

npm install -g pm2 
pm2 start -n "dsStack" Server.js
pm2 startup

env PATH=$PATH:/usr/bin /usr/local/bin/pm2 startup systemd -u ubuntu --hp /root
pm2 save

