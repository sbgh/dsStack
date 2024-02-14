#!/bin/bash
apt update
curl -sL https://deb.nodesource.com/setup_18.x | sudo bash -
apt -y install nodejs

cd /root/
git clone https://github.com/cybera/dsStack.git
cd /root/dsStack
npm install -y

apt install -y certbot