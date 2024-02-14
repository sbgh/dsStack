#!/bin/bash

sudo apt update
curl -sL https://deb.nodesource.com/setup_18.x | sudo bash -
sudo apt -y install nodejs

sudo mkdir /root/dstack
sudo cd /root/dstack
sudo clone https://github.com/cybera/dsStack.git 

sudo npm init -y

