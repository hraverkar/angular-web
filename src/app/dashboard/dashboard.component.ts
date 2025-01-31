import { AfterContentInit, Component } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ImportDialogComponent } from './import-dialog/import-dialog.component';
import { NewDialogComponent } from './new-dialog/new-dialog.component';
import { saveAs } from 'file-saver';

import { AppConfiguration } from '../models/app-config.model';
import { NodeConfiguration } from '../models/node-config.model';
import { NodeType } from '../models/node-type.model';
import { DialogData } from '../models/dialog-data.model';
// @ts-ignore
import * as d3 from 'd3';
import { DataService } from '../data.service';

import sdk from '@stackblitz/sdk';
import * as YAML from 'js-yaml';
import { NgxSpinnerService } from 'ngx-spinner';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements AfterContentInit {
  public appConfiguration: AppConfiguration = new AppConfiguration();

  public margin = { top: 20, right: 90, bottom: 30, left: 90 };
  public width = 0;
  public height = 0;
  public i = 0;
  public duration = 750;
  public root: any;
  public tree: any;
  public svg: any;
  public treemap: any;
  public selectedNode: any;

  public selectedNodeName = '';
  public newNodeName = '';

  public name: string;

  public isMenuOpen = false;

  public showSpinner = false;

  constructor(
    private dataService: DataService,
    public dialog: MatDialog,
    private _spinnerService: NgxSpinnerService
  ) {}

  public ngAfterContentInit() {
    this.appConfiguration.nodeConfiguration = new NodeConfiguration();
    this.appConfiguration.nodeConfiguration.name = 'app';
    this.appConfiguration.nodeConfiguration.type = NodeType.module;

    this.width = 960 - this.margin.right - this.margin.left;
    this.height = 500 - this.margin.top - this.margin.bottom;

    console.log('initialized...');

    this.svg = d3
      .select('svg')
      .on('click', () => {
        if (this.isMenuOpen) {
          d3.select('#my_custom_menu').style('display', 'none');
          this.isMenuOpen = false;
        }
      })
      // .attr('width', this.width + this.margin.right + this.margin.left)
      // .attr('height', this.height + this.margin.top + this.margin.bottom)
      .attr('width', '100%')
      .attr('height', this.height + this.margin.top + this.margin.bottom)
      .append('g')
      .attr(
        'transform',
        'translate(' + this.margin.left + ',' + this.margin.top + ')'
      );

    // declares a tree layout and assigns the size
    this.treemap = d3.tree().size([this.height, this.width]);

    // Assigns parent, children, height, depth
    this.root = d3.hierarchy(
      this.appConfiguration.nodeConfiguration,
      (d: any) => d.children
    );
    this.root.x0 = this.height / 2;
    this.root.y0 = 0;

    this.update(this.root);

    console.log(this.svg);
  }

  public createDialog(): void {
    const dialogRef = this.dialog.open(ImportDialogComponent, {
      width: '500px',
    });

    dialogRef
      .afterClosed()
      .subscribe((config: { data: string; type: number }) => {
        console.log('The dialog was closed', config);
        let appConfig: any;
        if (config.type === 1) {
          appConfig = JSON.parse(config.data) as AppConfiguration;
        } else if (config.type === 2) {
          appConfig = YAML.load(config.data);
        }
        this.appConfiguration = { ...appConfig };
        this.downloadApp();
      });
  }

  public openDialog(action: string): void {
    if (this.isMenuOpen) {
      d3.select('#my_custom_menu').style('display', 'none');
      this.isMenuOpen = false;
    }
    this.selectedNode.action = action;
    const modalData = this.selectedNode as DialogData;
    modalData.action = action;

    const dialogRef = this.dialog.open(NewDialogComponent, {
      width: '600px',
      height: '500px',
      data: modalData,
    });

    dialogRef.afterClosed().subscribe((newNode: NodeConfiguration) => {
      console.log('The dialog was closed', newNode);

      if (!this.selectedNode) {
        alert('Please select parent node!');
      }

      if (!newNode) {
        return;
      }

      if (action === 'create') {
        const node = {
          name: newNode.name,
          type: newNode.type,
          route: newNode.route,
          parentModule: this.selectedNode.data.name,
          modulePath: this.getModulePath(this.selectedNode, newNode.name),
        };

        const newD3Node: any = d3.hierarchy(node);
        newD3Node.depth = this.selectedNode.depth + 1;
        newD3Node.height = this.selectedNode.height + 1;
        newD3Node.parent = this.selectedNode;
        newD3Node.id = ++this.i;
        if (!this.selectedNode.children) {
          this.selectedNode.children = [];
          this.selectedNode.data.children = [];
        }

        this.selectedNode.children.push(newD3Node);
        this.selectedNode.data.children.push(newD3Node.data);

        this.update(this.selectedNode);
      } else {
        // TODO: Need to loop through all children of selected node and update their modulePath, route and name
        // console.log('updating existing node...');
        // this.updateModulePath(newNode);
        // debugger;
        // this.svg.select('#text-' + this.selectedNode.id).text(this.getNodeText(newNode));
        // this.updateNodeName();
      }
    });
  }

  public updateModulePath(newNode: NodeConfiguration) {
    const parts = newNode.modulePath.split('/');
    parts[parts.length - 1] = newNode.name;
    newNode.modulePath = parts.join('/');
  }

  public update(source: any) {
    // console.log(this.appConfiguration.nodeConfiguration);

    // Assigns the x and y position for the nodes
    const treeData = this.treemap(this.root);

    // Compute the new tree layout.
    const nodes = treeData.descendants();
    const links = treeData.descendants().slice(1);

    // Normalize for fixed-depth.
    nodes.forEach((d: any) => {
      d.y = d.depth * 180;
    });

    // ****************** Nodes section ***************************

    // Update the nodes...
    const node = this.svg
      .selectAll('g.node')
      .data(nodes, (d: any) => d.id || (d.id = ++this.i));

    // Enter any new modes at the parent's previous position.
    const nodeEnter = node
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', (d: any) => {
        return 'translate(' + source.y0 + ',' + source.x0 + ')';
      })
      .on('click', (e: any) => {
        this.click(e);
      });

    // Add Circle for the nodes
    nodeEnter
      .append('circle')
      .attr('class', 'node')
      .attr('r', 1e-6)
      .style('fill', (d: any) => {
        // return d.data.type == NodeType.module ? "black" : "white";
        // return d._children ? "lightsteelblue" : "#fff";
      })
      .on('click', (selectedNode: any) => {
        this.isMenuOpen = true;
        this.selectedNode = selectedNode;
        d3.select('#my_custom_menu')
          .style('position', 'absolute')
          .style('left', d3.event.clientX + 10 + 'px')
          .style('top', d3.event.clientY + 10 + 'px')
          .style('display', 'block');
        d3.event.stopPropagation();
      })
      .on('dblclick', (selectedNode: any) => {
        this.selectedNode = selectedNode;
        this.openDialog('create');
        d3.event.stopPropagation();
      });

    // Add labels for the nodes
    nodeEnter
      .append('text')
      .attr('dy', '.35em')
      .attr('x', (d: any) => {
        return d.children || d._children ? -13 : 13;
      })
      .attr('text-anchor', (d: any) => {
        return d.children || d._children ? 'end' : 'start';
      })
      .attr('id', (d: any) => 'text-' + d.id)
      .text((d: any) => {
        return this.getNodeText(d.data);
      });

    // UPDATE
    const nodeUpdate = nodeEnter.merge(node);

    // Transition to the proper position for the node
    nodeUpdate
      .transition()
      .duration(this.duration)
      .attr('transform', (d: any) => {
        return 'translate(' + d.y + ',' + d.x + ')';
      });

    // Update the node attributes and style
    nodeUpdate
      .select('circle.node')
      .attr('r', 10)
      .style('fill', (d: any) => {
        // return d.data.type == NodeType.module ? "black" : "white";

        return d._children ? 'lightsteelblue' : '#fff';
      })
      .attr('cursor', 'pointer');

    // Remove any exiting nodes
    const nodeExit = node
      .exit()
      .transition()
      .duration(this.duration)
      .attr('transform', (d: any) => {
        return 'translate(' + source.y + ',' + source.x + ')';
      })
      .remove();

    // On exit reduce the node circles size to 0
    nodeExit.select('circle').attr('r', 1e-6);

    // On exit reduce the opacity of text labels
    nodeExit.select('text').style('fill-opacity', 1e-6);

    // ****************** links section ***************************

    // Update the links...
    const link = this.svg.selectAll('path.link').data(links, (d: any) => d.id);

    // Enter any new links at the parent's previous position.
    const linkEnter = link
      .enter()
      .insert('path', 'g')
      .attr('class', 'link')
      .attr('d', (d: any) => {
        const o = { x: source.x0, y: source.y0 };
        return this.diagonal(o, o);
      });

    // UPDATE
    const linkUpdate = linkEnter.merge(link);

    // Transition back to the parent element position
    linkUpdate
      .transition()
      .duration(this.duration)
      .attr('d', (d: any) => this.diagonal(d, d.parent));

    // Remove any exiting links
    const linkExit = link
      .exit()
      .transition()
      .duration(this.duration)
      .attr('d', (d: any) => {
        const o = { x: source.x, y: source.y };
        return this.diagonal(o, o);
      })
      .remove();

    // Store the old positions for transition.
    nodes.forEach((d: any) => {
      d.x0 = d.x;
      d.y0 = d.y;
    });
  }

  public getNodeText(node: any) {
    return node.name + ' (' + node.type + ')';
  }

  public diagonal(s: any, d: any) {
    const path = `M ${s.y} ${s.x}
          C ${(s.y + d.y) / 2} ${s.x},
          ${(s.y + d.y) / 2} ${d.x},
          ${d.y} ${d.x}`;

    return path;
  }

  public click(d: any) {
    this.selectedNode = d;
    this.selectedNodeName = this.selectedNode.data.name;

    this.svg.selectAll('circle').style('fill', '#fff');

    this.svg
      .selectAll('circle')
      .filter((node: any) => node.id === d.id)
      .style('fill', (node: any) => {
        return node.id === d.id ? 'black' : '#fff';
      });
  }

  public addNode() {
    if (!this.selectedNode) {
      alert('Please select parent node!');
    }
    const newNode = { name: this.newNodeName, type: NodeType.moduleWithRoute };
    const newD3Node: any = d3.hierarchy(newNode);
    newD3Node.depth = this.selectedNode.depth + 1;
    newD3Node.height = this.selectedNode.height + 1;
    newD3Node.parent = this.selectedNode;
    newD3Node.id = ++this.i;
    if (!this.selectedNode.children) {
      this.selectedNode.children = [];
      this.selectedNode.data.children = [];
    }

    this.selectedNode.children.push(newD3Node);
    this.selectedNode.data.children.push(newD3Node.data);

    this.update(this.selectedNode);
  }

  public removeNode() {
    const children: any[] = [];
    this.selectedNode.parent.children.forEach((child: { id: any }) => {
      if (child.id !== this.selectedNode.id) {
        children.push(child);
      }
    });

    const dataChildren = [];
    this.selectedNode.parent.data.children.forEach((child: { id: any }) => {
      if (child.id !== this.selectedNode.id) {
        dataChildren.push(child);
      }
    });

    this.selectedNode.parent.children = children;
    this.selectedNode.parent.data.children = children;

    if (this.selectedNode.parent.children.length === 0) {
      delete this.selectedNode.parent.children;
    }
    this.update(this.selectedNode.parent);

    if (this.isMenuOpen) {
      d3.select('#my_custom_menu').style('display', 'none');
      this.isMenuOpen = false;
    }
  }

  public updateNodeName() {
    this.selectedNode.data.name = this.selectedNodeName;
    // console.log(this.selectedNode);
    this.svg
      .select('#text-' + this.selectedNode.id)
      .text(this.selectedNodeName);

    this.update(this.selectedNode);
  }

  public addNodeWithComponent() {
    if (!this.selectedNode) {
      alert('Please select parent node!');
    }
    const newNode = {
      name: this.newNodeName,
      type: NodeType.moduleWithRoute,
      // modulePath: this.selectedNode.data.name == 'app' ? '' : this.selectedNode.data.name,
      modulePath: this.getModulePath(this.selectedNode, this.newNodeName),
      route: this.newNodeName,
      parentModule: this.selectedNode.data.name,
    };
    const newD3Node: any = d3.hierarchy(newNode);
    newD3Node.depth = this.selectedNode.depth + 1;
    newD3Node.height = this.selectedNode.height + 1;
    newD3Node.parent = this.selectedNode;
    newD3Node.id = ++this.i;
    if (!this.selectedNode.children) {
      this.selectedNode.children = [];
      this.selectedNode.data.children = [];
    }

    this.selectedNode.children.push(newD3Node);
    this.selectedNode.data.children.push(newD3Node.data);

    this.update(this.selectedNode);
  }

  public getModulePath(node: any, newNodeName: string) {
    // this.selectedNode.data.name == 'app' ? '' : this.selectedNode.data.name
    console.log(node);

    const modulePath: Array<string> = [];
    modulePath.push(newNodeName);

    if (node.parent && node.parent.data.name === 'app') {
      modulePath.push(node.data.name);
    } else {
      while (node.parent && node.data.name !== 'app') {
        modulePath.push(node.data.name);
        node = node.parent;
      }
    }
    if (modulePath.length === 1) {
      return newNodeName;
    }
    const fullModulePath = modulePath.reverse().join('/');
    console.log(fullModulePath);

    return fullModulePath;
  }

  public generateApp() {
    this._spinnerService.show();
    this.showSpinner = true;
    this.dataService.generateApp(this.appConfiguration).subscribe(
      (response: any) => {
        console.log(response);
        this.replaceBackslashesWithSlashes(response.files)
        sdk.openProject(response);
        this.showSpinner = false;
        this._spinnerService.hide();
      },
      (err) => {
        this._spinnerService.hide();
        this.showSpinner = false;
        alert(JSON.stringify(err));
        console.error(err);
      }
    );
  }

  public downloadApp(): void {
    this._spinnerService.show();
    this.showSpinner = true;
    this.dataService.downloadApp(this.appConfiguration).subscribe(
      (response: ArrayBuffer) => {
        // Assuming response is a Blob or ArrayBuffer
        var blob = new Blob([response], { type: 'application/zip' });
        saveAs(blob, this.appConfiguration.name + '.zip');
        this.showSpinner = false;
        this._spinnerService.hide();
      },
      (err) => {
        this._spinnerService.hide();
        this.showSpinner = false;
        alert(JSON.stringify(err));
        console.error(err);
      }
    );
  }

  public replaceBackslashesWithSlashes(obj: any): any {
    if (obj instanceof Object) {
      Object.keys(obj).forEach(key => {
        const newKey = key.replace(/\\/g, '/');
        if (newKey !== key) {
          obj[newKey] = obj[key];
          delete obj[key];
        }
        this.replaceBackslashesWithSlashes(obj[newKey]);
      });
    }
    return obj;
  }
}
