# serverless-imager
A small demo project to showcase how you can run an existing `Node.js` + `Express` application on:
- an a virtual machine
- on Kubernetes
- on Google Cloud Functions

The steps in this file are written to support trying the demo out on `Google Cloud Platform`, but everything should work similarly on other cloud providers.

## Prerequisites

1. Set up a Project on Google Cloud Platform with Billing enabled (you can use the starting credits which will be enough for testing this project out)
1. Login to the Google Cloud Console and go here to initialize the Google Compute Engine for the first time using this URL: https://console.cloud.google.com/compute/instances
1. Download and install the `gcloud` command line tool (Google Cloud SDK) (See the details [here](https://cloud.google.com/sdk/downloads))
1. Run `gcloud init` command to authenticate yourself against the previously created Google Cloud Platform Project
   * Also don't skip setting up a preferred default region and zone with compute engine during the gcloud init
1. Clone this git repository to your computer and set your working directory to it:
```
git clone https://github.com/nightw/serverless-imager.git
cd serverless-imager
```

## Creating the storage bucket and setting up config.json

1. Create a storage bucket on `Google Cloud Storage` with this command (choose a bucketname which does not exist gloabally yet!):
```
gsutil mb -l us-central1 gs://serverless_imager_test_bucket
```
2. Create the `config.json` file by copying the example over from `config.json.example`:
```
cp config.json.example config.json
```
3. Edit the new `config.json` file. The key `bucket` should contain the bucket name which you created in this section. The other keys should also be edited to not be too long otherwise your file uploads might fail because of object name limits.

## Creating the VM and setting up the dependencies on it

Create the VM and a firewall rule to allow traffic to it on TCP port 8080
```
gcloud compute instances create test-nodejs \
    --machine-type g1-small \
    --image-family ubuntu-1604-lts \
    --image-project ubuntu-os-cloud \
    --tags enable-tcp-8080 \
    --scopes storage-rw,logging-write,monitoring,service-management,service-control,trace
gcloud compute firewall-rules create allow-tcp-8080-in \
    --allow tcp:8080 \
    --target-tags enable-tcp-8080
```

SSH to the VM:
```
gcloud compute ssh test-nodejs
```

Run these commands to install the dependencies and the app on the VM:
```
sudo apt-get update
sudo apt-get install -y build-essential
curl -s https://deb.nodesource.com/gpgkey/nodesource.gpg.key | sudo apt-key add -
echo 'deb https://deb.nodesource.com/node_8.x xenial main' | sudo tee  /etc/apt/sources.list.d/nodesource.list > /dev/null
echo 'deb-src https://deb.nodesource.com/node_8.x xenial main' | sudo tee -a /etc/apt/sources.list.d/nodesource.list > /dev/null
sudo apt-get update
sudo apt-get install -y nodejs
```

## Creating the Kubernetes cluster for testing the deployment on it

```
gcloud container clusters create test-kube-cluster --cluster-version 1.9.2-gke.1 --num-nodes 2 --zone europe-west1-d --scopes storage-rw,logging-write,monitoring,service-management,service-control,trace
gcloud container clusters get-credentials test-kube-cluster --zone europe-west1-d
```

## Deploying to the VM and checking if it works:

SSH to the VM:
```
gcloud compute ssh test-nodejs
```

Install the application on the VM:
```
git clone https://github.com/nightw/serverless-imager.git
cd serverless-imager
npm install
```

Create `config.json` file with the right content from the `Creating the storage bucket and setting up config.json` section.

Run the application:
```
npm start
```

Go back to your machine to get the VM's external IP with the port added:
```
echo "http://$(gcloud compute instances describe test-nodejs --format 'value(networkInterfaces.accessConfigs[0].natIP)'):8080"
```

And check the URL printed above in a browser to see if the application works correctly

## Deploying to the Kubernetes cluster and checking if everything works

Deploy the to cluster:
```
npm run deploy:kubernetes
kubectl expose deployment serverless-imager --type=LoadBalancer --port 80 --target-port 8080
```

(Here wait for some minutes for a public load balancer to be created for the application)

Then get the URL for the app:
```
echo "http://$(kubectl get service serverless-imager -o jsonpath='{.status.loadBalancer.ingress[0].ip}')"
```

Try the above URL from a browser to see if it is working correctly

## Deploying to Cloud Functions and checking if everything works

Deploy the to Cloud Functions:
```
npm run deploy:cloud-functions
```

Then get the URL for the app:
```
gcloud beta functions describe serverless_imager --format 'value(httpsTrigger.url)'
```

Try the above URL from a browser to see if it is working correctly

## Tear everything down

This is an important step, since this was only a demo and you should avoid unneccessary bills.

Run this in the command line on your machine (in the 4th command use your bucketname from the start of the demo!):

```
gcloud compute instances delete test-nodejs
gcloud container clusters delete test-kube-cluster
gcloud alpha functions delete serverless_imager
gsutil -m rm -r gs://serverless_imager_test_bucket
gcloud container images delete "gcr.io/$(gcloud config configurations list --filter is_active:true --format 'value(properties.core.project)')/serverless-imager:$(gcloud container images list-tags gcr.io/doctusoft-nightw-test/serverless-imager --format 'value(tags[0])')"
```

## Disclaimer

This project is only meant as an example showcasing the possibility to running `Node.js` + `Express` applications on Cloud Functions.

It is currently (March of 2018) not recommended to do this with actual production applications for multiple reasons from one is that Google Cloud Functions is still in beta without any SLA guarantees.

Also the code does not have any form of authentication or other protections, so if you run it in its current form, then you provided endless storage space for images for anyone on the Internet and the costs of the "service" will be backed by your credit card attached to the GCP account.

## Contributing

1. Fork it!
1. Create your feature branch: `git checkout -b my-new-feature`
1. Commit your changes: `git commit -am 'Add some feature'`
1. Push to the branch: `git push origin my-new-feature`
1. Submit a pull request :)

## License

Code released under [Apache License Version 2.0](LICENSE)