// Used only against the allowlisted runtime tree produced by package.cjs.
// Credentials remain in the invoking release owner's environment.
module.exports={
  appId:'app.travelplanner.desktop',productName:'Travel Planner',electronVersion:'44.4.3',
  asar:true,npmRebuild:false,nodeGypRebuild:false,forceCodeSigning:true,
  artifactName:'TravelPlanner-${version}-${os}-${arch}.${ext}',
  files:['**/*'],
  publish:[{provider:'github',owner:'wangch15',repo:'travel-planner',releaseType:'release',channel:'latest'}],
  mac:{target:['dmg','zip'],category:'public.app-category.travel',hardenedRuntime:true,notarize:true,icon:'desktop/prototype/assets/brand/light/app.icns'},
  win:{target:['nsis'],icon:'desktop/prototype/assets/brand/light/app.ico',signAndEditExecutable:true,publisherName:process.env.TRAVEL_PLANNER_WINDOWS_PUBLISHER||undefined},
  nsis:{oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,deleteAppDataOnUninstall:false},
};
