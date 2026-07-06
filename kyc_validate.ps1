$ErrorActionPreference='Stop'
$baseUrl='http://localhost:5000'
$r=[ordered]@{health=$null;seller=[ordered]@{email=$null;id=$null;tokenPresent=$false;register=$null;login=$null};beforeSubmit=$null;afterDelete=$null;afterSubmit=$null;admin=[ordered]@{loginAttempted=@();loginSuccess=$false;blocked=$false;documents='blocked'};verdict=$null;failures=@()}

function Err($e){$s=$null;$b=$null;try{if($e.Exception.Response){$s=[int]$e.Exception.Response.StatusCode;$sr=New-Object IO.StreamReader($e.Exception.Response.GetResponseStream());$b=$sr.ReadToEnd();$sr.Close()}}catch{};if((-not $b)-and $e.ErrorDetails){$b=$e.ErrorDetails.Message};[ordered]@{status=$s;bodySnippet=if($b){$b.Substring(0,[Math]::Min(300,$b.Length))}else{$null};message=$e.Exception.Message}}
function Api($m,$p,$body,$tok){$pm=@{Method=$m;Uri="$baseUrl$p";ErrorAction='Stop'};if($tok){$pm.Headers=@{Authorization="Bearer $tok"}};if($null -ne $body){$pm.ContentType='application/json';$pm.Body=($body|ConvertTo-Json -Depth 12)};try{$o=Invoke-RestMethod @pm;[ordered]@{ok=$true;status=200;body=$o}}catch{[ordered]@{ok=$false;error=(Err $_)}}}
function Pick($o,$arr){foreach($k in $arr){$cur=$o;foreach($n in $k.Split('.')){if($null -eq $cur){break};$cur=$cur.$n};if($null -ne $cur -and $cur -ne ''){return $cur}};return $null}

$h=Api 'GET' '/api/health' $null $null
if(-not $h.ok){$r.health=[ordered]@{ok=$false;failure=$h.error};$r.verdict='FAIL: /api/health unavailable. Stopped.';$r|ConvertTo-Json -Depth 12;exit 1}
$r.health=[ordered]@{ok=$true;body=$h.body}

$ts=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();$email="kyc.test.$ts@lumina.local";$pwd='Test@12345';$r.seller.email=$email
$reg=Api 'POST' '/api/auth/register' @{name='KYC Test Seller';email=$email;password=$pwd;role='seller'} $null
$r.seller.register=if($reg.ok){[ordered]@{ok=$true}}else{[ordered]@{ok=$false;failure=$reg.error}}
$log=Api 'POST' '/api/auth/login' @{email=$email;password=$pwd;role='seller'} $null
$r.seller.login=if($log.ok){[ordered]@{ok=$true}}else{[ordered]@{ok=$false;failure=$log.error}}
if(-not $log.ok){$r.verdict='FAIL: seller login failed';$r|ConvertTo-Json -Depth 12;exit 1}
$tok=Pick $log.body @('token','accessToken','data.token','data.accessToken','user.token')
$sid=[string](Pick $log.body @('user.id','user._id','userId','id','_id','data.user.id','data.user._id'))
$r.seller.id=$sid;$r.seller.tokenPresent=[bool]$tok
if(-not $tok){$r.verdict='FAIL: seller token missing';$r|ConvertTo-Json -Depth 12;exit 1}

function Ver($obj){[ordered]@{status=(Pick $obj @('status','verificationStatus','data.status','data.verificationStatus','verification.status'));documentsUploaded=(Pick $obj @('documentsUploaded','docsUploaded','data.documentsUploaded','verification.documentsUploaded'))}}
$v1=Api 'GET' '/api/seller/settings/verification' $null $tok;$r.beforeSubmit=if($v1.ok){Ver $v1.body}else{[ordered]@{error=$v1.error}}
$d=Api 'DELETE' '/api/seller/settings/verification/documents' $null $tok;if(-not $d.ok){$r.failures+=@([ordered]@{step='delete';detail=$d.error})}
$v2=Api 'GET' '/api/seller/settings/verification' $null $tok;$r.afterDelete=if($v2.ok){Ver $v2.body}else{[ordered]@{error=$v2.error}}
$s=Api 'POST' '/api/seller/settings/verification/submit' @{pendingDocuments=@{cnicFront=@{dataUrl='data:image/png;base64,AAAA'};cnicBack=@{dataUrl='data:image/png;base64,BBBB'};selfie=@{dataUrl='data:image/png;base64,CCCC'}}} $tok
if(-not $s.ok){$r.failures+=@([ordered]@{step='submit';detail=$s.error})}
$v3=Api 'GET' '/api/seller/settings/verification' $null $tok;$r.afterSubmit=if($v3.ok){Ver $v3.body}else{[ordered]@{error=$v3.error}}

$creds=@(@{e='admin1@lumina.com';p='admin@123'},@{e='admin@lumina.com';p='admin@123'},@{e='admin1@lumina.com';p='Admin@123'})
$atok=$null
foreach($c in $creds){$al=Api 'POST' '/api/admin/auth/login' @{email=$c.e;password=$c.p} $null;$r.admin.loginAttempted+=@([ordered]@{email=$c.e;ok=$al.ok;failure=if($al.ok){$null}else{$al.error}});if($al.ok){$atok=Pick $al.body @('token','accessToken','data.token');if($atok){$r.admin.loginSuccess=$true;break}}}
if($atok){
  $list=Api 'GET' '/api/admin/sellers/sellers' $null $atok
  if($list.ok){$arr=@();if($list.body -is [array]){$arr=$list.body}elseif($list.body.sellers){$arr=@($list.body.sellers)}elseif($list.body.data){$arr=@($list.body.data)};$m=$null;foreach($x in $arr){$xid=[string](Pick $x @('id','_id','userId'));$xe=Pick $x @('email','user.email');if(($sid -and $xid -eq $sid) -or ($xe -eq $email)){$m=$x;break}};if($m){$mid=[string](Pick $m @('id','_id','userId'));$det=Api 'GET' "/api/admin/sellers/sellers/$mid" $null $atok;if($det.ok){$docs=@();if($det.body.documents){$docs=@($det.body.documents)}elseif($det.body.verificationDocuments){$docs=@($det.body.verificationDocuments)}elseif($det.body.seller.documents){$docs=@($det.body.seller.documents)};$types=@();foreach($z in $docs){$t=Pick $z @('type','documentType','name');if($t){$types+=[string]$t}};$r.admin.documents=[ordered]@{count=$docs.Count;types=$types}}else{$r.admin.documents=[ordered]@{error=$det.error}}}else{$r.admin.documents=[ordered]@{error='Seller not found in admin list'}}}else{$r.admin.documents=[ordered]@{error=$list.error}}
}else{$r.admin.blocked=$true}

$bn=$false;$ah=$false;if($r.afterDelete -and $null -ne $r.afterDelete.documentsUploaded){$bn=(-not [bool]$r.afterDelete.documentsUploaded)};if($r.afterSubmit -and $null -ne $r.afterSubmit.documentsUploaded){$ah=[bool]$r.afterSubmit.documentsUploaded}
if($r.admin.blocked){$r.verdict=if($bn -and $ah){'PARTIAL PASS: seller-side pass; admin blocked by creds'}else{'INCONCLUSIVE'}}else{$cnt=0;if($r.admin.documents.count){$cnt=[int]$r.admin.documents.count};$r.verdict=if($bn -and $ah -and $cnt -gt 0){'PASS: docs saved only after submit and visible to admin'}else{'FAIL/INCONCLUSIVE'}}
$r|ConvertTo-Json -Depth 12
