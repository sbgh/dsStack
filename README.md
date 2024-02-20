# dsStack

## A service and graphical user interface to build data science environments in the cloud

Setup:

Create a public/private key-pair.

Create a security group allowing ingress traffic of ssh port 22, https port 8443.

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
The setup will install a self signed https (SSL) certificate. This will require you to answer some questions during the setup. (Your location, email, etc)

The setup installs pm2 (A utility to start and stop dsStack)

When the setup is complete the dsSack application should be running. You should be able to open it in your browser. Eg. https://ipaddress:8443

Note that since a self signed https (SSL) certificate was installed you will see a warning on your browser saying that your connection is not secure. You can ignore this warning and proceed.

The setup will provide you with a new user id. Enter this string into settings.