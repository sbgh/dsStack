# dsStack

## A self-hosted service and graphical user interface to build data science environments in the cloud

![dsStack](https://raw.githubusercontent.com/cybera/dsStack/master/static/images/dsStack-1000.png)

dsStack is a Node.js browser application that helps you to learn about data science tools, platforms and utilities. dsStack includes a set of small scripts, called components, that can be stacked and organized into chains of functionality.

Eg:

[create keypair] -> [create instance] -> [create volume] -> [attach volume] -> [install Streamlit] -> etc...

### Setup:

Create a public/private key-pair.

Create a security group allowing ingress traffic of ssh port 22, https port 8443 (8443 is the default web port).

Create an instance in the Rapid Access Cloud or AWS with these stats:
* Ubuntu 20.04 or later
* m1-small or larger
* Include public key

Log into your new server via ssh. 
Eg.
```
ssh -i mykey.pem ubuntu@ip.add.re.ss
```

Switch to root user. Change directory to root home, then download setup script and run it:
```
sudo su
cd ~
curl https://raw.githubusercontent.com/cybera/dsStack/master/setup.sh -o setup.sh
chmod +x setup.sh
./setup.sh
```
The setup will install a self signed https (SSL) certificate. 

The setup installs pm2 (A utility to start and stop dsStack)

When the setup is complete the dsSack application should be running. You should be able to open it in your browser. 
Eg. https://ipaddress:8443

Note that since a self signed https (SSL) certificate was installed, you will see a warning on your browser saying that your connection is not secure. You can ignore this warning and proceed.

The setup will provide you with a new "user id". Enter this user id string into settings. 

### Settings

In the upper right corner of the dsStack web application there is a settings button. Click this button to open settings.
In settings there are a set of fields that are required for regular operations;

Your Name - Enter your name or a test string that will uniquely identify you in the logs.

Login Name - The SSH user name (Eg ubuntu) to log into your target server.

Host Name - The host name of IP address of the target server.

Private Key - The SSH private key user to SSH into the target server.

User ID - The alpha numeric string to uniquely identify the datastore you will be saving to.