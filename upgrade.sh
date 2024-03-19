#!/bin/bash

echo "stop dsStack"
sudo pm2 stop dsStack
sudo curl https://raw.githubusercontent.com/cybera/dsStack/master/Server.js -o Server.js
sudo pm2 start dsStack