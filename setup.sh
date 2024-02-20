#!/bin/bash

echo "apt update"
apt update

echo "Install node.js"
curl -sL https://deb.nodesource.com/setup_18.x | sudo bash -
apt -y install nodejs

echo "Clone dsStack repo"
cd /root/
git clone https://github.com/cybera/dsStack.git
cd /root/dsStack

echo "Install prerequisites"
npm install -y

echo "setup component Data"
mkdir compData
mkdir backup
userID=$(tr -dc A-Za-z0-9 </dev/urandom | head -c 13; echo)
cp compData.json compData/compData.$userID.json

echo "Make a self-signed SSL certificate"
mkdir -p /etc/ssl/private
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/ssl/private/privkey.pem -out /etc/ssl/private/fullchain.pem

echo "install certbot incase you need it in the future"
apt install -y certbot
echo "You can use certbot later to create a valid SSL certificate if you own a domain name."

echo "Install pm2"
npm install -g pm2 
pm2 start -n "dsStack" Server.js
pm2 startup
env PATH=$PATH:/usr/bin /usr/local/bin/pm2 startup systemd -u ubuntu --hp /root
pm2 save

echo "Your user id is $userID"
echo Enter this id into settings.
