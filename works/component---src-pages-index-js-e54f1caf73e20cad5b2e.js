(window.webpackJsonp=window.webpackJsonp||[]).push([[4],{156:function(e,t,n){"use strict";n.r(t);var a=n(0),r=n.n(a),i=n(168),o=n(169),l=n(162),s=(n(36),n(57),n(3)),c=n.n(s),u=(n(190),n(158)),d=n.n(u),p=n(159),m=n.n(p),f=n(163);function g(){var e=d()(["\n    margin-bottom: 4rem;\n  "]);return g=function(){return e},e}function h(){var e=d()(["\n  color: #757575;\n  margin: 0 0rem 2rem;\n\n  ",";\n"]);return h=function(){return e},e}function b(){var e=d()(["\n  display: inline-block;\n  font-size: 2rem;\n  font-weight: 500;\n  margin: 2rem 0rem 1rem;\n  background-color:rgba(255,255,60,0.3);\n"]);return b=function(){return e},e}var y=m.a.span(b()),E=m.a.p(h(),f.a.TABLET(g())),v=function(e){var t=e.title,n=e.copy;e.image;return r.a.createElement("figure",null,r.a.createElement("figcaption",null,r.a.createElement(y,null,t),r.a.createElement(E,null,n)))};v.propTypes={title:c.a.string,copy:c.a.string,image:c.a.object.isRequired};var w=v;function x(){var e=d()(["\n    display: block;\n  "]);return x=function(){return e},e}function S(){var e=d()(["\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  grid-gap: 4rem;\n  padding: 0 4rem;\n  margin: 2rem 0;\n\n  ",";\n"]);return S=function(){return e},e}var z=m.a.div(S(),f.a.TABLET(x())),k=function(e){var t=e.items;return r.a.createElement(z,null,t.map(function(e,t){return r.a.createElement(w,Object.assign({},e,{key:t}))}))};k.propTypes={items:c.a.arrayOf(c.a.object).isRequired};var T=k;n.d(t,"query",function(){return R});t.default=function(e){var t=e.data;return r.a.createElement(i.a,null,r.a.createElement(o.a,null,r.a.createElement(l.a,{as:"h1",size:"large"},t.homeJson.content.childMarkdownRemark.rawMarkdownBody)),r.a.createElement(T,{items:t.homeJson.gallery}))};var R="751990366"},160:function(e,t,n){"use strict";n.r(t),n.d(t,"graphql",function(){return g}),n.d(t,"StaticQueryContext",function(){return m}),n.d(t,"StaticQuery",function(){return f});var a=n(0),r=n.n(a),i=n(3),o=n.n(i),l=n(157),s=n.n(l);n.d(t,"Link",function(){return s.a}),n.d(t,"withPrefix",function(){return l.withPrefix}),n.d(t,"navigate",function(){return l.navigate}),n.d(t,"push",function(){return l.push}),n.d(t,"replace",function(){return l.replace}),n.d(t,"navigateTo",function(){return l.navigateTo});var c=n(26);n.d(t,"waitForRouteChange",function(){return c.c});var u=n(161),d=n.n(u);n.d(t,"PageRenderer",function(){return d.a});var p=n(38);n.d(t,"parsePath",function(){return p.a});var m=r.a.createContext({}),f=function(e){return r.a.createElement(m.Consumer,null,function(t){return e.data||t[e.query]&&t[e.query].data?(e.render||e.children)(e.data?e.data.data:t[e.query].data):r.a.createElement("div",null,"Loading (StaticQuery)")})};function g(){throw new Error("It appears like Gatsby is misconfigured. Gatsby related `graphql` calls are supposed to only be evaluated at compile time, and then compiled away,. Unfortunately, something went wrong and the query was left in the compiled code.\n\n.Unless your site has a complex or custom babel/Gatsby configuration this is likely a bug in Gatsby.")}f.propTypes={data:o.a.object,query:o.a.string.isRequired,render:o.a.func,children:o.a.func}},161:function(e,t,n){var a;e.exports=(a=n(166))&&a.default||a},162:function(e,t,n){"use strict";var a=n(0),r=n.n(a),i=n(3),o=n.n(i),l=n(158),s=n.n(l),c=n(159),u=n.n(c),d=n(163);function p(){var e=s()(["\n    font-size: ",";\n  "]);return p=function(){return e},e}function m(){var e=s()(["\n  display: block;\n  font-weight: ",";\n  font-size: ",";\n  line-height: 1.2;\n\n  ",";\n"]);return m=function(){return e},e}var f=u.a.span(m(),function(e){var t=e.size;return function(){switch(t){case"large":return"700";default:return"500"}}},function(e){var t=e.size;return function(){switch(t){case"large":return"10rem";default:return"2rem"}}},d.a.TABLET(p(),function(e){var t=e.size;return function(){switch(t){case"large":return"6rem";default:return"2rem"}}})),g=function(e){var t=e.children,n=e.as,a=void 0===n?"span":n,i=e.size;return r.a.createElement(f,{as:a,size:i},t)};g.propTypes={children:o.a.string.isRequired,tag:o.a.string};t.a=g},163:function(e,t,n){"use strict";var a=n(158),r=n.n(a),i=(n(84),n(55),n(174),n(54),n(159)),o={DESKTOP:992,TABLET:768,PHONE:376};function l(){var e=r()(["\n    @media (min-width: ","em) {\n      ",";\n    }\n  "]);return l=function(){return e},e}function s(){var e=r()(["\n    @media (max-width: ","em) {\n      ",";\n    }\n  "]);return s=function(){return e},e}var c=Object.keys(o).reduce(function(e,t){return e[t]=function(){return Object(i.css)(s(),o[t]/16,i.css.apply(void 0,arguments))},e["MIN_"+t]=function(){return Object(i.css)(l(),o[t]/16,i.css.apply(void 0,arguments))},e},{});t.a=c},164:function(e,t,n){"use strict";n(36);var a=n(167),r=n(0),i=n.n(r),o=n(3),l=n.n(o),s=n(172),c=n(160),u=n(15),d=function(e){var t=e.siteTitle,n=(e.siteTitleShort,e.siteDescription),a=e.siteUrl,r=e.pageTitle,o=e.pageTitleFull,l=void 0===o?r?t+": "+r:t:o,c=e.themeColor,u=e.social,d=e.imageUrl,p=e.location,m=e.canonical,f=void 0===m?a+(p.pathname||""):m;return i.a.createElement(s.Helmet,null,i.a.createElement("html",{lang:"en"}),i.a.createElement("meta",{content:"IE=edge",httpEquiv:"X-UA-Compatible"}),i.a.createElement("meta",{content:"width=device-width,initial-scale=1.0,user-scalable=yes",name:"viewport"}),i.a.createElement("meta",{content:t,name:"apple-mobile-web-app-title"}),i.a.createElement("meta",{content:l,property:"og:title"}),i.a.createElement("meta",{content:l,name:"twitter:title"}),i.a.createElement("title",null,"Rober González - UX"),i.a.createElement("meta",{content:n,name:"description"}),i.a.createElement("meta",{content:n,property:"og:description"}),i.a.createElement("meta",{content:n,name:"twitter:description"}),i.a.createElement("meta",{content:"yes",name:"apple-mobile-web-app-capable"}),i.a.createElement("meta",{content:"black-translucent",name:"apple-mobile-web-app-status-bar-style"}),i.a.createElement("meta",{content:c,name:"theme-color"}),i.a.createElement("meta",{content:t,name:"application-name"}),i.a.createElement("meta",{content:"website",property:"og:type"}),i.a.createElement("meta",{content:t,property:"og:site_name"}),i.a.createElement("meta",{content:u.fbAppId,property:"fb:app_id"}),i.a.createElement("meta",{content:"summary_large_image",name:"twitter:card"}),i.a.createElement("meta",{content:"@"+u.twitter,name:"twitter:site"}),i.a.createElement("meta",{content:"@"+u.twitter,name:"twitter:creator"}),i.a.createElement("meta",{content:l,name:"twitter:text:title"}),i.a.createElement("meta",{content:f,property:"og:url"}),i.a.createElement("meta",{content:f,name:"twitter:url"}),i.a.createElement("link",{rel:"canonical",href:f}),i.a.createElement("meta",{content:d||a+"/social.png",property:"og:image"}),i.a.createElement("meta",{content:"1024",property:"og:image:width"}),i.a.createElement("meta",{content:"512",property:"og:image:height"}),i.a.createElement("meta",{content:d||a+"/social.png",name:"twitter:image"}),i.a.createElement("meta",{content:"1024",name:"twitter:image:width"}),i.a.createElement("meta",{content:"512",name:"twitter:image:height"}),i.a.createElement("meta",{content:d||a+"/social.png",property:"og:image"}),i.a.createElement("meta",{content:"1024",property:"og:image:width"}),i.a.createElement("meta",{content:"512",property:"og:image:height"}),i.a.createElement("meta",{content:c,name:"msapplication-TileColor"}),i.a.createElement("meta",{content:"/icons/mstile-70x70.png",name:"msapplication-square70x70"}),i.a.createElement("meta",{content:"/icons/mstile-144x144.png",name:"msapplication-square144x144"}),i.a.createElement("meta",{content:"/icons/mstile-150x150.png",name:"msapplication-square150x150"}),i.a.createElement("meta",{content:"/icons/mstile-310x150.png",name:"msapplication-wide310x150"}),i.a.createElement("meta",{content:"/icons/mstile-310x310.png",name:"msapplication-square310x310"}),i.a.createElement("link",{href:"/manifest.json",rel:"manifest"}),i.a.createElement("link",{href:"/icons/apple-touch-icon-57x57.png",rel:"apple-touch-icon",sizes:"57x57"}),i.a.createElement("link",{href:"/icons/apple-touch-icon-60x60.png",rel:"apple-touch-icon",sizes:"60x60"}),i.a.createElement("link",{href:"/icons/apple-touch-icon-72x72.png",rel:"apple-touch-icon",sizes:"72x72"}),i.a.createElement("link",{href:"/icons/apple-touch-icon-76x76.png",rel:"apple-touch-icon",sizes:"76x76"}),i.a.createElement("link",{href:"/icons/apple-touch-icon-114x114.png",rel:"apple-touch-icon",sizes:"114x114"}),i.a.createElement("link",{href:"/icons/apple-touch-icon-120x120.png",rel:"apple-touch-icon",sizes:"120x120"}),i.a.createElement("link",{href:"/icons/apple-touch-icon-144x144.png",rel:"apple-touch-icon",sizes:"144x144"}),i.a.createElement("link",{href:"/icons/apple-touch-icon-152x152.png",rel:"apple-touch-icon",sizes:"152x152"}),i.a.createElement("link",{href:"/icons/apple-touch-icon-167x167.png",rel:"apple-touch-icon",sizes:"167x167"}),i.a.createElement("link",{href:"/icons/apple-touch-icon-180x180.png",rel:"icon",sizes:"180x180",type:"image/png"}),i.a.createElement("link",{href:"/icons/favicon-32x32.png",rel:"icon",sizes:"32x32",type:"image/png"}),i.a.createElement("link",{href:"/icons/favicon-16x16.png",rel:"icon",sizes:"16x16",type:"image/png"}),i.a.createElement("script",{type:"application/ld+json"},JSON.stringify(function(e){var t=e.location,n=e.canonical,a=e.siteUrl,r=e.pageTitle,i=e.siteTitle,o=[{"@context":"http://schema.org","@type":"WebSite",url:n,name:r||i,alternateName:e.pageTitleFull}];return r&&"/"!==t.pathname&&o.push({"@context":"http://schema.org","@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,item:{"@id":a,name:i}},{"@type":"ListItem",position:2,item:{"@id":n,name:r}}]}),o}({location:p,canonical:f,siteUrl:a,pageTitle:r,siteTitle:t,pageTitleFull:l}))))};d.propTypes={siteTitle:l.a.string,siteTitleShort:l.a.string,siteDescription:l.a.string,siteUrl:l.a.string,themeColor:l.a.string,social:l.a.objectOf(l.a.string),imageUrl:l.a.string,canonical:l.a.string,pageTitle:l.a.string,pageTitleFull:l.a.string};t.a=function(e){return i.a.createElement(c.StaticQuery,{query:"177639445",render:function(t){return i.a.createElement(u.Location,null,function(n){var a=n.location;return i.a.createElement(d,Object.assign({},t.site.siteMetadata,e,{location:a}))})},data:a})}},165:function(e){e.exports={data:{site:{siteMetadata:{siteTitle:"Rober González"}}}}},166:function(e,t,n){"use strict";n.r(t);n(36);var a=n(0),r=n.n(a),i=n(3),o=n.n(i),l=n(60),s=n(1),c=function(e){var t=e.location,n=s.default.getResourcesForPathnameSync(t.pathname);return r.a.createElement(l.a,Object.assign({location:t,pageResources:n},n.json))};c.propTypes={location:o.a.shape({pathname:o.a.string.isRequired}).isRequired},t.default=c},167:function(e){e.exports={data:{site:{siteMetadata:{siteTitle:"Rober González",siteTitleShort:"Rober",siteDescription:"Rober González - UX Researcher",siteUrl:"https://rober.design",themeColor:"#000",social:{twitter:"robergd",fbAppId:""}}}}}},168:function(e,t,n){"use strict";n(36);var a=n(165),r=n(0),i=n.n(r),o=n(3),l=n.n(o),s=n(160),c=n(164),u=n(48),d=n.n(u),p=n(158),m=n.n(p),f=n(159),g=n.n(f);function h(){var e=m()(["\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  padding: 4rem;\n  a{\n    text-decoration: none;\n  }\n"]);return h=function(){return e},e}var b=g.a.header(h()),y=n(162);function E(){var e=m()(["\n  ul {\n    display: flex;\n    list-style: none;\n    padding: 0;\n\n    li {\n      text-transform: uppercase;\n      font-size: 1.3rem;\n\n      & + li {\n        margin-left: 2rem;\n      }\n    }\n  }\n"]);return E=function(){return e},e}var v=g.a.nav(E()),w=function(){return i.a.createElement(v,null,i.a.createElement("ul",null,i.a.createElement("li",null,i.a.createElement(s.Link,{to:"/about"},"About"))))},x=d.a.div({enter:{y:0,transition:{ease:"easeInOut"}},exit:{y:"-100%",transition:{ease:"easeInOut"}}}),S=function(e){var t=e.title;return i.a.createElement(x,null,i.a.createElement(b,null,i.a.createElement(s.Link,{to:"/"},i.a.createElement(y.a,{as:"h1"},t)),i.a.createElement(w,null)))};S.propTypes={title:l.a.string.isRequired};var z=S;function k(){var e=m()(['\n  html, body, div, span, applet, object, iframe,\n  h1, h2, h3, h4, h5, h6, p, blockquote, pre,\n  a, abbr, acronym, address, big, cite, code,\n  del, dfn, em, img, ins, kbd, q, s, samp,\n  small, strike, strong, sub, sup, tt, var,\n  b, u, i, center,\n  dl, dt, dd, ol, ul, li,\n  fieldset, form, label, legend,\n  table, caption, tbody, tfoot, thead, tr, th, td,\n  article, aside, canvas, details, embed,\n  figure, figcaption, footer, header, hgroup,\n  menu, nav, output, ruby, section, summary,\n  time, mark, audio, video {\n    margin: 0;\n    padding: 0;\n    border: 0;\n    font-size: 100%;\n    font: inherit;\n    vertical-align: baseline;\n  }\n\n  /* HTML5 display-role reset for older browsers */\n  article, aside, details, figcaption, figure,\n  footer, header, hgroup, menu, nav, section {\n    display: block;\n  }\n\n  ::-moz-selection{\n    background:#000000;\n    color:#fff\n  }\n  ::selection{\n    background:#000000;\n    color:#fff\n  }\n\n  html {\n    font-size: 62.5%;\n  }\n\n  body {\n    font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol";\n    line-height: 1;\n    font-size: 1.6rem;\n    color: #000;\n    background-color: #fff;\n    -webkit-text-size-adjust: 100%;\n    -webkit-font-smoothing: antialiased;\n    -moz-osx-font-smoothing: grayscale;\n    text-rendering: optimizeLegibility;\n    -webkit-font-feature-settings: "pnum";\n    font-feature-settings: "pnum";\n    font-variant-numeric: proportional-nums;\n  }\n\n  ol, ul {\n    list-style: none;\n  }\n\n  blockquote, q {\n    quotes: none;\n  }\n\n  blockquote:before, blockquote:after,\n  q:before, q:after {\n    content: \'\';\n    content: none;\n  }\n\n  table {\n    border-collapse: collapse;\n    border-spacing: 0;\n  }\n\n  a {\n    color: ',";\n    text-decoration: underline;\n    &:hover {\n      color: #fff;\n      background-color: #000;\n    }\n  }\n\n  pre {\n    display: block;\n    padding: 2rem;\n    margin-top: 4rem;\n    overflow: auto;\n    font-size: 85%;\n    line-height: 1.45;\n    border-radius: 5px;\n    color: ",';\n    border: 1px solid #ddd;\n    font-family: "SFMono-Regular",Consolas,"Liberation Mono",Menlo,Courier,monospace;\n  }\n\n  video {\n    max-width: 100%;\n  }\n\n  p {\n    margin-top: 2rem;\n    margin-bottom: 2rem;\n    line-height: 1.5em;\n    font-size: 20px;\n  }\n  picture{\n    img{\n      filter: contrast(1);\n      opacity: 0.9;\n    }\n  }\n']);return k=function(){return e},e}var T=Object(f.createGlobalStyle)(k(),"#000000","#000000"),R=function(e){var t=e.data,n=e.children;return i.a.createElement("div",null,i.a.createElement(T,null),i.a.createElement(c.a,null),i.a.createElement(z,{title:t.site.siteMetadata.siteTitle}),n)};R.propTypes={children:l.a.node.isRequired,data:l.a.object.isRequired};var q=function(e){return i.a.createElement(s.StaticQuery,{query:"2302781957",render:function(t){return i.a.createElement(R,Object.assign({data:t},e))},data:a})};q.propTypes={children:l.a.node.isRequired};t.a=q},169:function(e,t,n){"use strict";var a=n(0),r=n.n(a),i=n(3),o=n.n(i),l=n(158),s=n.n(l),c=n(159);function u(){var e=s()(["\n  padding: 2rem 4rem;\n  max-width: 900px;\n"]);return u=function(){return e},e}var d=n.n(c).a.div(u()),p=function(e){var t=e.children;return r.a.createElement(d,null,t)};p.propTypes={children:o.a.node.isRequired};t.a=p},190:function(e,t,n){"use strict";var a=n(37);t.__esModule=!0,t.default=void 0;var r,i=a(n(5)),o=a(n(56)),l=a(n(170)),s=a(n(171)),c=a(n(0)),u=a(n(3)),d=function(e){var t=(0,s.default)({},e);return t.resolutions&&(t.fixed=t.resolutions,delete t.resolutions),t.sizes&&(t.fluid=t.sizes,delete t.sizes),t},p={},m=function(e){var t=d(e),n=t.fluid?t.fluid.src:t.fixed.src;return!!p[n]||(p[n]=!0,!1)},f=[];var g=function(e,t){(void 0===r&&"undefined"!=typeof window&&window.IntersectionObserver&&(r=new window.IntersectionObserver(function(e){e.forEach(function(e){f.forEach(function(t){t[0]===e.target&&(e.isIntersecting||e.intersectionRatio>0)&&(r.unobserve(t[0]),t[1]())})})},{rootMargin:"200px"})),r).observe(e),f.push([e,t])},h=function(e){var t=e.src?'src="'+e.src+'" ':'src="" ',n=e.sizes?'sizes="'+e.sizes+'" ':"",a=e.srcSetWebp?"<source type='image/webp' srcSet=\""+e.srcSetWebp+'" '+n+"/>":"",r=e.srcSet?'<source srcSet="'+e.srcSet+'" '+n+"/>":"",i=e.title?'title="'+e.title+'" ':"",o=e.alt?'alt="'+e.alt+'" ':'alt="" ',l=e.width?'width="'+e.width+'" ':"",s=e.height?'height="'+e.height+'" ':"",c=e.opacity?e.opacity:"1";return"<picture>"+a+r+"<img "+l+s+t+o+i+'style="position:absolute;top:0;left:0;transition:opacity 0.5s;transition-delay:'+(e.transitionDelay?e.transitionDelay:"0.5s")+";opacity:"+c+';width:100%;height:100%;object-fit:cover;object-position:center"/></picture>'},b=c.default.forwardRef(function(e,t){var n=e.style,a=e.onLoad,r=e.onError,i=(0,l.default)(e,["style","onLoad","onError"]);return c.default.createElement("img",(0,s.default)({},i,{onLoad:a,onError:r,ref:t,style:(0,s.default)({position:"absolute",top:0,left:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"center"},n)}))});b.propTypes={style:u.default.object,onError:u.default.func,onLoad:u.default.func};var y=function(e){function t(t){var n;n=e.call(this,t)||this;var a=!0,r=!0,i=!1,l=t.fadeIn,s=m(t);!s&&"undefined"!=typeof window&&window.IntersectionObserver&&(a=!1,r=!1,i=!0),"undefined"==typeof window&&(a=!1,r=!1),t.critical&&(a=!0,r=!1,i=!1);var u=!(n.props.critical&&!n.props.fadeIn);return n.state={isVisible:a,imgLoaded:r,IOSupported:i,fadeIn:l,hasNoScript:u,seenBefore:s},n.imageRef=c.default.createRef(),n.handleImageLoaded=n.handleImageLoaded.bind((0,o.default)((0,o.default)(n))),n.handleRef=n.handleRef.bind((0,o.default)((0,o.default)(n))),n}(0,i.default)(t,e);var n=t.prototype;return n.componentDidMount=function(){if(this.props.critical){var e=this.imageRef.current;e&&e.complete&&this.handleImageLoaded()}},n.handleRef=function(e){var t=this;this.state.IOSupported&&e&&g(e,function(){t.setState({isVisible:!0})})},n.handleImageLoaded=function(){this.setState({imgLoaded:!0}),this.state.seenBefore&&this.setState({fadeIn:!1}),this.props.onLoad&&this.props.onLoad()},n.render=function(){var e,t=d(this.props),n=t.title,a=t.alt,r=t.className,i=t.style,o=void 0===i?{}:i,l=t.imgStyle,u=void 0===l?{}:l,p=t.placeholderStyle,m=void 0===p?{}:p,f=t.fluid,g=t.fixed,y=t.backgroundColor,E=t.Tag;e="boolean"==typeof y?"lightgray":y;var v=(0,s.default)({opacity:this.state.imgLoaded?0:1,transition:"opacity 0.5s",transitionDelay:this.state.imgLoaded?"0.5s":"0.25s"},u,m),w=(0,s.default)({opacity:this.state.imgLoaded||!1===this.state.fadeIn?1:0,transition:!0===this.state.fadeIn?"opacity 0.5s":"none"},u);if(f){var x=f;return c.default.createElement(E,{className:(r||"")+" gatsby-image-wrapper",style:(0,s.default)({position:"relative",overflow:"hidden"},o),ref:this.handleRef},c.default.createElement(E,{style:{width:"100%",paddingBottom:100/x.aspectRatio+"%"}}),x.base64&&c.default.createElement(b,{alt:a,title:n,src:x.base64,style:v}),x.tracedSVG&&c.default.createElement(b,{alt:a,title:n,src:x.tracedSVG,style:v}),e&&c.default.createElement(E,{title:n,style:{backgroundColor:e,position:"absolute",top:0,bottom:0,opacity:this.state.imgLoaded?0:1,transitionDelay:"0.35s",right:0,left:0}}),this.state.isVisible&&c.default.createElement("picture",null,x.srcSetWebp&&c.default.createElement("source",{type:"image/webp",srcSet:x.srcSetWebp,sizes:x.sizes}),c.default.createElement("source",{srcSet:x.srcSet,sizes:x.sizes}),c.default.createElement(b,{alt:a,title:n,src:x.src,style:w,ref:this.imageRef,onLoad:this.handleImageLoaded,onError:this.props.onError})),this.state.hasNoScript&&c.default.createElement("noscript",{dangerouslySetInnerHTML:{__html:h((0,s.default)({alt:a,title:n},x))}}))}if(g){var S=g,z=(0,s.default)({position:"relative",overflow:"hidden",display:"inline-block",width:S.width,height:S.height},o);return"inherit"===o.display&&delete z.display,c.default.createElement(E,{className:(r||"")+" gatsby-image-wrapper",style:z,ref:this.handleRef},S.base64&&c.default.createElement(b,{alt:a,title:n,src:S.base64,style:v}),S.tracedSVG&&c.default.createElement(b,{alt:a,title:n,src:S.tracedSVG,style:v}),e&&c.default.createElement(E,{title:n,style:{backgroundColor:e,width:S.width,opacity:this.state.imgLoaded?0:1,transitionDelay:"0.25s",height:S.height}}),this.state.isVisible&&c.default.createElement("picture",null,S.srcSetWebp&&c.default.createElement("source",{type:"image/webp",srcSet:S.srcSetWebp,sizes:S.sizes}),c.default.createElement("source",{srcSet:S.srcSet,sizes:S.sizes}),c.default.createElement(b,{alt:a,title:n,width:S.width,height:S.height,src:S.src,style:w,ref:this.imageRef,onLoad:this.handleImageLoaded,onError:this.props.onError})),this.state.hasNoScript&&c.default.createElement("noscript",{dangerouslySetInnerHTML:{__html:h((0,s.default)({alt:a,title:n,width:S.width,height:S.height},S))}}))}return null},t}(c.default.Component);y.defaultProps={critical:!1,fadeIn:!0,alt:"",Tag:"div"};var E=u.default.shape({width:u.default.number.isRequired,height:u.default.number.isRequired,src:u.default.string.isRequired,srcSet:u.default.string.isRequired,base64:u.default.string,tracedSVG:u.default.string,srcWebp:u.default.string,srcSetWebp:u.default.string}),v=u.default.shape({aspectRatio:u.default.number.isRequired,src:u.default.string.isRequired,srcSet:u.default.string.isRequired,sizes:u.default.string.isRequired,base64:u.default.string,tracedSVG:u.default.string,srcWebp:u.default.string,srcSetWebp:u.default.string});y.propTypes={resolutions:E,sizes:v,fixed:E,fluid:v,fadeIn:u.default.bool,title:u.default.string,alt:u.default.string,className:u.default.oneOfType([u.default.string,u.default.object]),critical:u.default.bool,style:u.default.object,imgStyle:u.default.object,placeholderStyle:u.default.object,backgroundColor:u.default.oneOfType([u.default.string,u.default.bool]),onLoad:u.default.func,onError:u.default.func,Tag:u.default.string};var w=y;t.default=w}}]);
//# sourceMappingURL=component---src-pages-index-js-e54f1caf73e20cad5b2e.js.map