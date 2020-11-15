import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const ecInstance = new aws.ec2.Instance(`my-esdb-ec2`, {
  instanceType: "t2.micro",
  keyName: "you-key-name",
  ami: "ami-06fd8a495a537da8b",
  vpcSecurityGroupIds: [getSecurityGroup().id],
  userData: getSetupScript(),
  tags: {
    Name: `my-esdb-ec2`,
  },
});

function getSetupScript(): string {
  const userData = `#!/bin/bash
    # Install EventStore
    curl -s https://packagecloud.io/install/repositories/EventStore/EventStore-OSS/script.deb.sh | sudo bash
    sudo apt-get install eventstore-oss=20.6.1-2

    # Update EventStore Config
    sudo echo "${getEventStoreConfig()}" >| /etc/eventstore/eventstore.conf

    # Create /data folder and add permissions to eventstore
    cd /
    mkdir data
    sudo chown eventstore data
    sudo chgrp eventstore data

    # Create certificates
    cd /data
    sudo mkdir certs
    cd certs/
    sudo wget -c https://github.com/EventStore/es-gencert-cli/releases/download/1.0.2/es-gencert-cli_1.0.2_Linux-x86_64.tar.gz
    sudo tar -xzvf es-gencert-cli_1.0.2_Linux-x86_64.tar.gz
    sudo ./es-gencert-cli create-ca -days 
    sudo ./es-gencert-cli create-node -out ./node1 --dns-names *.example.com
    find . -type f  -name '*.crt' -o -name '*.key' -print0 | sudo xargs -0 chmod 666
    
    # Run EventStore
    sudo systemctl enable eventstore
    sudo systemctl start eventstore
    `;
  return userData;
}

function getEventStoreConfig() {
  return `# Paths
Db: /data/eventstore/db
Index: /data/eventstore/index
Log: /data/eventstore/log

# Certificates configuration
CertificateFile: /data/certs/node1/node.crt
CertificatePrivateKeyFile: /data/certs/node1/node.key
TrustedRootCertificatesPath: /data/certs/ca

# Network configuration
HttpPort: 2113
ExtTcpPort: 1113
EnableExternalTcp: true
EnableAtomPubOverHTTP: true

# Cluster config
ClusterSize: 1

# Projections configuration
RunProjections: System`;
}

function getSecurityGroup(): awsx.ec2.SecurityGroup {
  let esSecurityGroup = new awsx.ec2.SecurityGroup(`es-sg`, {
    vpc: awsx.ec2.Vpc.getDefault(),
    tags: {
      Name: `es-sg`,
    },
  });

  awsx.ec2.SecurityGroupRule.ingress(
    `in-es-ec2-22`,
    esSecurityGroup,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.TcpPorts(22),
    `allow 22`
  );

  // Allow traffic for EventStore
  awsx.ec2.SecurityGroupRule.ingress(
    `in-es-ec2-2113`,
    esSecurityGroup,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.TcpPorts(2113),
    `allow 2113`
  );

  awsx.ec2.SecurityGroupRule.ingress(
    `in-es-ec2-1113`,
    esSecurityGroup,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.TcpPorts(1113),
    `allow 1113`
  );

  awsx.ec2.SecurityGroupRule.egress(
    `out-es-ec2-all`,
    esSecurityGroup,
    new awsx.ec2.AnyIPv4Location(),
    new awsx.ec2.AllTcpPorts(),
    `out es-ec2 all`
  );

  return esSecurityGroup;
}
