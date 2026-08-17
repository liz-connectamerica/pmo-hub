function daysAgo(n) {
  var d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

var ALL_PEOPLE = ['Alex Turner','Mia Nguyen','Jordan Lee','Sam Park','Casey Morgan','Robin Chen','Dana Wu','Chris Bell'];
var VALUE_AREAS = ['Revenue Growth','Customer Experience','Operational Efficiency','Employee Experience','Compliance & Risk'];
var PHASES = ['Not Started','Discovery','Design','Build','Testing','Deployment','Monitor'];
var STATUSES = ['Not Started','On Track','At Risk','Planning','Blocked','Complete'];
var PRIORITIES = ['Critical','High','Medium','Low','Needs prioritization'];
var TSHIRT_SIZES = ['XS','S','M','L','XL'];
var AV_COLS = ['av-purple','av-teal','av-blue','av-coral','av-amber'];
var CATEGORIES = ['Transformation','Hardware','Services','Infrastructure'];
var BUSINESS_UNITS = ['Corporate Functions','Customer Experience','Finance','Human Resources','Legal & Compliance','Marketing','Operations','Product','Sales','Supply Chain','Technology'];
var RISK_STATUSES = ['Open','Monitoring','Mitigated','Closed'];
var IMPACTS = ['High','Medium','Low'];
var DOC_TYPES = ['Project Charter','Project Plan','Project Schedule','Project KPIs'];

var D = {
  role: 'admin',
  notifications: [],

  requests: [
  ],

  workRequests: [
  ],

  projects: [
    { id:'p1', name:'Inventory Management System', pm:'Alex Turner', sponsor:'Casey Morgan', category:'Transformation', businessUnit:'Supply Chain', team:['Alex Turner','Mia Nguyen','Jordan Lee'], status:'On Track', phase:'Build', progress:45, start:'2025-04-01', end:'2025-09-30', value:'Operational Efficiency', priority:'Critical', description:'End-to-end inventory tracking and forecasting system replacing manual spreadsheet processes.', blockers:'Vendor API docs delayed by 1 week', health:'green', stage:'active', plannedStart:'2025-04-01', requestId:'r2',
      milestones:[{id:'m1',name:'Discovery complete',date:'2025-04-30',done:true,completedDate:'2025-04-28',log:[{date:'2025-04-01',actor:'Alex Turner',action:'Created',detail:''},{date:'2025-04-28',actor:'Alex Turner',action:'Completed',detail:'Completed date: 2025-04-28'}]},{id:'m2',name:'Design approved',date:'2025-05-31',done:true,completedDate:'2025-06-03',log:[{date:'2025-04-01',actor:'Alex Turner',action:'Created',detail:''},{date:'2025-06-03',actor:'Mia Nguyen',action:'Completed',detail:'Completed date: 2025-06-03 (target was 2025-05-31)'}]},{id:'m3',name:'Alpha build',date:'2025-07-31',done:false,log:[{date:'2025-04-01',actor:'Alex Turner',action:'Created',detail:''}]},{id:'m4',name:'UAT',date:'2025-09-01',done:false,log:[{date:'2025-04-01',actor:'Alex Turner',action:'Created',detail:''}]},{id:'m5',name:'Go-live',date:'2025-09-30',done:false,log:[{date:'2025-04-01',actor:'Alex Turner',action:'Created',detail:''}]}],
      tasks:[{id:'t1',title:'API integration spec',assignee:'Mia Nguyen',status:'Done',due:'2025-05-20'},{id:'t2',title:'DB schema design',assignee:'Jordan Lee',status:'Done',due:'2025-05-25'},{id:'t3',title:'Backend endpoints',assignee:'Jordan Lee',status:'In Progress',due:'2025-07-01'},{id:'t4',title:'Frontend build',assignee:'Mia Nguyen',status:'To Do',due:'2025-08-01'},{id:'t5',title:'Testing suite',assignee:'Alex Turner',status:'To Do',due:'2025-09-01'}],
      raid:{risks:[{id:'ri1',desc:'Vendor API delays could push delivery',probability:60,impact:'High',status:'Monitoring',owner:'Alex Turner',mitigation:'Weekly check-ins with vendor; escalation path defined if slip exceeds 2 weeks',log:[{date:'2025-04-15',actor:'Alex Turner',action:'Created',detail:''}]}],assumptions:[{id:'a1',desc:'Warehouse team available for UAT in Sept',owner:'Mia Nguyen',log:[{date:'2025-04-15',actor:'Mia Nguyen',action:'Created',detail:''}]}],issues:[{id:'i1',desc:'Dev environment config mismatch',severity:'Medium',owner:'Jordan Lee',status:'Open',solution:'Standardizing on shared Docker config; rollout to all dev machines by end of sprint',log:[{date:'2025-05-02',actor:'Jordan Lee',action:'Created',detail:''}]}],dependencies:[{id:'d1',desc:'Salesforce integration requires IT approval',owner:'Alex Turner',status:'Pending',log:[{date:'2025-04-20',actor:'Alex Turner',action:'Created',detail:''}]}]},
      documents:[{id:'doc1',category:'Project Charter',name:'Inventory Mgmt Project Charter',sourceType:'link',url:'https://example.sharepoint.com/charter',folder:'Governance',dateAdded:'2025-04-05'}],
      docFolders:['General','Governance']
    },
    { id:'p2', name:'Customer Portal Redesign', pm:'Mia Nguyen', sponsor:'Robin Chen', category:'Services', businessUnit:'Customer Experience', team:['Mia Nguyen','Sam Park','Taylor Brooks'], status:'At Risk', phase:'Design', progress:20, start:'2025-06-01', end:'2025-11-30', value:'Customer Experience', priority:'High', description:'Full redesign of the customer self-service portal to reduce friction and support load.', blockers:'Design agency contract not yet signed', health:'amber', stage:'active', plannedStart:'2025-06-01', requestId:'r1',
      milestones:[{id:'m6',name:'Discovery complete',date:'2025-06-30',done:true,completedDate:'2025-06-30',log:[{date:'2025-06-01',actor:'Mia Nguyen',action:'Created',detail:''},{date:'2025-06-30',actor:'Mia Nguyen',action:'Completed',detail:'Completed date: 2025-06-30'}]},{id:'m7',name:'Wireframes approved',date:'2025-07-31',done:false,log:[{date:'2025-06-01',actor:'Mia Nguyen',action:'Created',detail:''}]},{id:'m8',name:'Dev handoff',date:'2025-09-01',done:false,log:[{date:'2025-06-01',actor:'Mia Nguyen',action:'Created',detail:''}]},{id:'m9',name:'Beta launch',date:'2025-11-01',done:false,log:[{date:'2025-06-01',actor:'Mia Nguyen',action:'Created',detail:''}]},{id:'m10',name:'Go-live',date:'2025-11-30',done:false,log:[{date:'2025-06-01',actor:'Mia Nguyen',action:'Created',detail:''}]}],
      tasks:[{id:'t6',title:'Stakeholder interviews',assignee:'Mia Nguyen',status:'Done',due:'2025-06-20'},{id:'t7',title:'User journey mapping',assignee:'Sam Park',status:'In Progress',due:'2025-07-10'},{id:'t8',title:'Wireframes',assignee:'Sam Park',status:'To Do',due:'2025-07-25'},{id:'t9',title:'Vendor budget sign-off',assignee:'Taylor Brooks',status:'To Do',due:'2025-08-05'}],
      raid:{risks:[{id:'ri2',desc:'Agency delay may push wireframe timeline',probability:70,impact:'High',status:'Open',owner:'Mia Nguyen',mitigation:'Identify backup agency; shortlist two alternatives by end of June',log:[{date:'2025-06-05',actor:'Mia Nguyen',action:'Created',detail:''}]}],assumptions:[{id:'a2',desc:'Budget of $45k approved by finance',log:[{date:'2025-06-01',actor:'Mia Nguyen',action:'Created',detail:''}]}],issues:[{id:'i2',desc:'Contract signature pending legal review',severity:'High',owner:'Mia Nguyen',status:'Open',log:[{date:'2025-06-10',actor:'Mia Nguyen',action:'Created',detail:''}]}],dependencies:[{id:'d2',desc:'Requires UX research from Marketing team',owner:'Sam Park',status:'Active',log:[{date:'2025-06-03',actor:'Sam Park',action:'Created',detail:''}]}]},
      documents:[],
      docFolders:['General']
    },
    { id:'p3', name:'HR Onboarding Automation', pm:'', sponsor:'', category:'Transformation', businessUnit:'Human Resources', team:[], status:'Not Started', phase:'Not Started', progress:0, start:'', end:'2025-10-31', value:'Employee Experience', priority:'Medium', description:'Automate the 40-step new hire onboarding process across 6 systems.', blockers:'', health:'green', stage:'backlog', plannedStart:'', requestId:'r3',
      milestones:[{id:'m11',name:'Process mapping',date:'2025-07-31',done:false,log:[{date:'2025-06-08',actor:'Priya Patel',action:'Created',detail:''}]},{id:'m12',name:'Tool selection',date:'2025-08-15',done:false,log:[{date:'2025-06-08',actor:'Priya Patel',action:'Created',detail:''}]},{id:'m13',name:'Build complete',date:'2025-10-01',done:false,log:[{date:'2025-06-08',actor:'Priya Patel',action:'Created',detail:''}]},{id:'m14',name:'Go-live',date:'2025-10-31',done:false,log:[{date:'2025-06-08',actor:'Priya Patel',action:'Created',detail:''}]}],
      tasks:[],
      raid:{risks:[],assumptions:[{id:'a3',desc:'HR team can dedicate 4hrs/week to project',log:[{date:'2025-06-08',actor:'Priya Patel',action:'Created',detail:''}]}],issues:[],dependencies:[{id:'d3',desc:'Requires IT to provision sandbox HRIS environment',owner:'TBD',status:'Pending',log:[{date:'2025-06-08',actor:'Priya Patel',action:'Created',detail:''}]}]},
      documents:[],
      docFolders:['General']
    }
  ],

  resources: [
  ],

  programs: [
  ]
};
